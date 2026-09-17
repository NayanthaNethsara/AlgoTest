package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/NayanthaNethsara/mini-algothon/loadtest/dashboard"
	"github.com/NayanthaNethsara/mini-algothon/loadtest/scenarios"
)

type ProfileConfig struct {
	UserCount   int
	Concurrency int
	Duration    time.Duration
}

var standardProfiles = map[string]ProfileConfig{
	"smoke":   {UserCount: 5, Concurrency: 5, Duration: 5 * time.Second},
	"light":   {UserCount: 20, Concurrency: 10, Duration: 10 * time.Second},
	"medium":  {UserCount: 50, Concurrency: 25, Duration: 20 * time.Second},
	"heavy":   {UserCount: 100, Concurrency: 50, Duration: 30 * time.Second},
	"extreme": {UserCount: 250, Concurrency: 100, Duration: 60 * time.Second},
}

func main() {
	var (
		baseURL      = flag.String("url", "https://mini-algothon-api.nayantha.me", "Target backend API base URL")
		scenario     = flag.String("scenario", "submissions", "Test scenario: submissions, burst, read, cleanup")
		profile      = flag.String("profile", "smoke", "Preset profile: smoke, light, medium, heavy, extreme")
		usersCount   = flag.Int("users", 0, "Override user count (0 uses profile default)")
		concurrency  = flag.Int("concurrency", 0, "Override concurrency limit (0 uses profile default)")
		duration     = flag.Duration("duration", 0, "Override duration for read benchmark")
		language     = flag.String("lang", "cpp", "Language for submissions/runs (cpp, python, js)")
		payloadMode  = flag.String("payload-mode", "mixed", "Payload code mix: mixed, AC, TLE, MLE, RTE, CE, WA")
		problemSlug  = flag.String("problem", "", "Target problem slug or ID")
		usersFile    = flag.String("users-file", "", "Path to CSV file with username,password")
		saveUsers    = flag.String("save-users", "", "Path to save auto-provisioned users CSV")
		adminUser    = flag.String("admin", "", "Admin username for user provisioning or cleanup")
		adminPass    = flag.String("admin-pass", "", "Admin password for user provisioning or cleanup")
		cacheDir     = flag.String("cache-dir", "sessions", "Directory to store session cache")
		noCache      = flag.Bool("no-cache", false, "Disable session cache and force re-login")
		outputDir    = flag.String("output-dir", "reports", "Directory to write benchmark reports")
		pollInterval = flag.Duration("poll", 1*time.Second, "Polling interval for judge verdicts")
		maxTimeout   = flag.Duration("timeout", 90*time.Second, "Max timeout for judging submissions")
		startUI      = flag.Bool("ui", false, "Launch interactive web dashboard server on localhost")
		uiPort       = flag.Int("port", 8088, "Port for web dashboard server")
	)
	flag.Parse()

	cleanBaseURL := strings.TrimRight(*baseURL, "/")

	if *startUI {
		server := dashboard.NewServer(*uiPort, *outputDir, cleanBaseURL)
		if err := server.Start(); err != nil {
			fmt.Fprintf(os.Stderr, "Dashboard error: %v\n", err)
			os.Exit(1)
		}
		return
	}
	httpClient := &http.Client{Timeout: 30 * time.Second}
	ctx := context.Background()

	// Verify server connectivity
	healthResp, err := httpClient.Get(cleanBaseURL + "/healthz")
	if err != nil || (healthResp.StatusCode != http.StatusOK && healthResp.StatusCode != http.StatusAccepted) {
		statusCode := 0
		if healthResp != nil {
			statusCode = healthResp.StatusCode
			healthResp.Body.Close()
		}
		fmt.Fprintf(os.Stderr, "Error: Target API unreachable at %s/healthz (HTTP %d, err: %v)\n", cleanBaseURL, statusCode, err)
		os.Exit(1)
	}
	healthResp.Body.Close()

	// Handle cleanup scenario directly
	if *scenario == "cleanup" {
		if *adminUser == "" || *adminPass == "" {
			fmt.Fprintln(os.Stderr, "Error: -admin and -admin-pass are required for cleanup scenario.")
			os.Exit(1)
		}
		sessionMgr := scenarios.NewSessionManager(httpClient, cleanBaseURL)
		adminToken, loginErr := sessionMgr.AdminLogin(*adminUser, *adminPass)
		if loginErr != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", loginErr)
			os.Exit(1)
		}

		fmt.Printf("== Purging Test Artifacts on %s ==\n", cleanBaseURL)
		cleanReport, cleanErr := scenarios.RunCleanup(ctx, scenarios.CleanupConfig{
			BaseURL:        cleanBaseURL,
			AdminToken:     adminToken,
			CacheDirectory: *cacheDir,
		})
		if cleanErr != nil {
			fmt.Fprintf(os.Stderr, "Cleanup error: %v\n", cleanErr)
			os.Exit(1)
		}

		fmt.Printf("  Deleted Users: %d\n", cleanReport.DeletedUsers)
		fmt.Printf("  Deleted Teams: %d\n", cleanReport.DeletedTeams)
		if len(cleanReport.PurgedFiles) > 0 {
			fmt.Printf("  Purged Session Files: %v\n", cleanReport.PurgedFiles)
		}
		return
	}

	// Resolve profile settings
	selectedProfile, profileExists := standardProfiles[strings.ToLower(*profile)]
	if !profileExists {
		selectedProfile = standardProfiles["smoke"]
	}

	effectiveUsers := selectedProfile.UserCount
	if *usersCount > 0 {
		effectiveUsers = *usersCount
	}

	effectiveConcurrency := selectedProfile.Concurrency
	if *concurrency > 0 {
		effectiveConcurrency = *concurrency
	}

	effectiveDuration := selectedProfile.Duration
	if *duration > 0 {
		effectiveDuration = *duration
	}

	sessionMgr := scenarios.NewSessionManager(httpClient, cleanBaseURL)
	var adminToken string

	if *adminUser != "" && *adminPass != "" {
		var loginErr error
		adminToken, loginErr = sessionMgr.AdminLogin(*adminUser, *adminPass)
		if loginErr != nil {
			fmt.Fprintf(os.Stderr, "Notice: Admin login failed: %v\n", loginErr)
		}
	}

	// Resolve User Sessions
	var sessions []scenarios.UserSession
	isUsingCachedSessions := false

	if !*noCache {
		if cached, ok := sessionMgr.TryLoadCachedSessions(*cacheDir, effectiveUsers); ok {
			sessions = cached
			isUsingCachedSessions = true
			fmt.Printf("  Reusing %d active sessions from cache (skipping /api/v1/auth/login)\n", len(sessions))
		}
	}

	if !isUsingCachedSessions {
		var creds []scenarios.UserCredential

		if *usersFile != "" {
			var loadErr error
			creds, loadErr = sessionMgr.LoadCredentialsFromCSV(*usersFile)
			if loadErr != nil {
				fmt.Fprintf(os.Stderr, "Error loading users from CSV: %v\n", loadErr)
				os.Exit(1)
			}
			if len(creds) > effectiveUsers {
				creds = creds[:effectiveUsers]
			}
		} else if adminToken != "" {
			fmt.Printf("== Auto-Provisioning %d Test Contestant Accounts ==\n", effectiveUsers)
			var provErr error
			creds, provErr = sessionMgr.AutoProvisionUsers(adminToken, effectiveUsers)
			if provErr != nil {
				fmt.Fprintf(os.Stderr, "Error auto-provisioning users: %v\n", provErr)
				os.Exit(1)
			}
			if *saveUsers != "" {
				saveCredsCSV(*saveUsers, creds)
			}
		} else if *scenario == "read" {
			fmt.Println("  Running public read benchmark on /healthz and /api/v1/contest/state (specify -users-file or -admin for authenticated read endpoints)")
		} else {
			// Try default backend/test_contestants.csv if available
			defaultCSVPath := filepath.Join("..", "backend", "test_contestants.csv")
			if c, loadErr := sessionMgr.LoadCredentialsFromCSV(defaultCSVPath); loadErr == nil && len(c) > 0 {
				creds = c
				if len(creds) > effectiveUsers {
					creds = creds[:effectiveUsers]
				}
				fmt.Printf("  Loaded %d credentials from %s\n", len(creds), defaultCSVPath)
			} else {
				fmt.Fprintln(os.Stderr, "Error: You must provide either:")
				fmt.Fprintln(os.Stderr, "  1) -users-file <path_to_csv>")
				fmt.Fprintln(os.Stderr, "  2) -admin <user> -admin-pass <pass> (to auto-provision)")
				os.Exit(1)
			}
		}

		if len(creds) > 0 {
			fmt.Printf("  Pacing authentication for %d users (6 workers, 50ms delay)...\n", len(creds))
			authStart := time.Now()
			var authErr error
			sessions, authErr = sessionMgr.AuthenticateUsersWithPacing(creds)
			if authErr != nil {
				fmt.Fprintf(os.Stderr, "Authentication error: %v\n", authErr)
				if *scenario != "read" {
					os.Exit(1)
				}
			} else {
				fmt.Printf("  Successfully authenticated %d users (took %s)\n", len(sessions), time.Since(authStart).Round(time.Millisecond))
				if !*noCache && len(sessions) > 0 {
					_ = sessionMgr.SaveSessionsToCache(*cacheDir, sessions)
				}
			}
		}
	}

	fmt.Printf("\n== Executing Load Test Scenario: %s (Profile: %s) ==\n", *scenario, *profile)
	fmt.Printf("  Target URL       : %s\n", cleanBaseURL)
	fmt.Printf("  Total Users      : %d\n", len(sessions))
	fmt.Printf("  Concurrency Limit: %d\n\n", effectiveConcurrency)

	var report *scenarios.TestExecutionReport
	var execErr error

	switch strings.ToLower(*scenario) {
	case "submissions":
		report, execErr = scenarios.RunSubmissionStress(ctx, scenarios.SubmissionStressConfig{
			BaseURL:        cleanBaseURL,
			Sessions:       sessions,
			AdminToken:     adminToken,
			ProblemSlug:    *problemSlug,
			Language:       *language,
			PayloadMode:    *payloadMode,
			Concurrency:    effectiveConcurrency,
			PollInterval:   *pollInterval,
			MaxTimeout:     *maxTimeout,
			ProfileName:    *profile,
		})
	case "burst":
		report, execErr = scenarios.RunSandboxBurst(ctx, scenarios.SandboxBurstConfig{
			BaseURL:       cleanBaseURL,
			Sessions:      sessions,
			Concurrency:   effectiveConcurrency,
			TotalRequests: effectiveUsers,
			Language:      *language,
			ProfileName:   *profile,
		})
	case "read":
		report, execErr = scenarios.RunGatewayRead(ctx, scenarios.GatewayReadConfig{
			BaseURL:     cleanBaseURL,
			Sessions:    sessions,
			Duration:    effectiveDuration,
			Concurrency: effectiveConcurrency,
			ProfileName: *profile,
		})
	default:
		fmt.Fprintf(os.Stderr, "Unknown scenario '%s'. Valid options: submissions, burst, read, cleanup\n", *scenario)
		os.Exit(1)
	}

	if execErr != nil {
		fmt.Fprintf(os.Stderr, "Scenario execution failed: %v\n", execErr)
		os.Exit(1)
	}

	printReportSummary(report)
	saveReportFiles(*outputDir, report)
}

func printReportSummary(report *scenarios.TestExecutionReport) {
	fmt.Printf("\n==================== TEST RESULTS SUMMARY ====================\n")
	fmt.Printf("  Scenario          : %s (%s)\n", report.Title, report.ProfileName)
	fmt.Printf("  Target URL        : %s\n", report.TargetURL)
	fmt.Printf("  Total Contestants : %d\n", report.TotalUsers)
	fmt.Printf("  Elapsed Duration  : %s\n", report.ElapsedDuration.Round(time.Millisecond))
	fmt.Printf("  Total Requests    : %d\n", report.LatencyMetrics.TotalRequests)
	fmt.Printf("  Successful Graded : %d\n", report.LatencyMetrics.SuccessCount)
	fmt.Printf("  Failed / Stalled  : %d\n", report.LatencyMetrics.FailCount)
	fmt.Printf("  Throughput        : %.2f requests/sec\n", report.ThroughputRPS)

	if report.LatencyMetrics.SuccessCount > 0 {
		fmt.Printf("\nLatency Percentiles:\n")
		fmt.Printf("  P50 (Median)      : %s\n", report.LatencyMetrics.P50.Round(time.Millisecond))
		fmt.Printf("  P90               : %s\n", report.LatencyMetrics.P90.Round(time.Millisecond))
		fmt.Printf("  P95               : %s\n", report.LatencyMetrics.P95.Round(time.Millisecond))
		fmt.Printf("  P99               : %s\n", report.LatencyMetrics.P99.Round(time.Millisecond))
		fmt.Printf("  Max Latency       : %s\n", report.LatencyMetrics.Max.Round(time.Millisecond))
	}

	if len(report.VerdictBreakdown) > 0 {
		fmt.Printf("\nVerdict Breakdown:\n")
		for v, count := range report.VerdictBreakdown {
			fmt.Printf("  %-15s : %d\n", v, count)
		}
	}

	if report.APIProbeMetrics != nil && report.APIProbeMetrics.TotalRequests > 0 {
		fmt.Printf("\nAPI Responsiveness Under Load:\n")
		fmt.Printf("  Probed Requests   : %d\n", report.APIProbeMetrics.TotalRequests)
		fmt.Printf("  Success Rate      : %d / %d\n", report.APIProbeMetrics.SuccessCount, report.APIProbeMetrics.TotalRequests)
		fmt.Printf("  Average Latency   : %s\n", report.APIProbeMetrics.Average.Round(time.Millisecond))
		fmt.Printf("  P95 Latency       : %s\n", report.APIProbeMetrics.P95.Round(time.Millisecond))
	}
	fmt.Printf("==============================================================\n\n")
}

func saveReportFiles(outputDir string, report *scenarios.TestExecutionReport) {
	_ = os.MkdirAll(outputDir, 0755)
	timestamp := time.Now().Format("20060102_150405")
	baseFilename := fmt.Sprintf("report_%s_%s_%s", report.ScenarioName, report.ProfileName, timestamp)

	// JSON report
	jsonPath := filepath.Join(outputDir, baseFilename+".json")
	if jsonData, err := json.MarshalIndent(report, "", "  "); err == nil {
		_ = os.WriteFile(jsonPath, jsonData, 0644)
	}

	// Markdown report
	mdPath := filepath.Join(outputDir, baseFilename+".md")
	var mdBuilder strings.Builder
	mdBuilder.WriteString(fmt.Sprintf("# Load Test Report: %s\n\n", report.Title))
	mdBuilder.WriteString(fmt.Sprintf("- **Timestamp**: `%s`\n", report.Timestamp))
	mdBuilder.WriteString(fmt.Sprintf("- **Target URL**: `%s`\n", report.TargetURL))
	mdBuilder.WriteString(fmt.Sprintf("- **Scenario**: `%s`\n", report.ScenarioName))
	mdBuilder.WriteString(fmt.Sprintf("- **Profile**: `%s`\n", report.ProfileName))
	mdBuilder.WriteString(fmt.Sprintf("- **Contestants / Users**: `%d`\n", report.TotalUsers))
	mdBuilder.WriteString(fmt.Sprintf("- **Concurrency Limit**: `%d`\n", report.ConcurrencyLimit))
	mdBuilder.WriteString(fmt.Sprintf("- **Duration**: `%s`\n", report.ElapsedDuration.Round(time.Millisecond)))
	mdBuilder.WriteString(fmt.Sprintf("- **Throughput**: `%.2f req/s`\n\n", report.ThroughputRPS))

	mdBuilder.WriteString("## Latency Distribution\n\n")
	mdBuilder.WriteString("| Metric | Latency |\n| --- | --- |\n")
	mdBuilder.WriteString(fmt.Sprintf("| P50 (Median) | `%s` |\n", report.LatencyMetrics.P50.Round(time.Millisecond)))
	mdBuilder.WriteString(fmt.Sprintf("| P90 | `%s` |\n", report.LatencyMetrics.P90.Round(time.Millisecond)))
	mdBuilder.WriteString(fmt.Sprintf("| P95 | `%s` |\n", report.LatencyMetrics.P95.Round(time.Millisecond)))
	mdBuilder.WriteString(fmt.Sprintf("| P99 | `%s` |\n", report.LatencyMetrics.P99.Round(time.Millisecond)))
	mdBuilder.WriteString(fmt.Sprintf("| Max | `%s` |\n\n", report.LatencyMetrics.Max.Round(time.Millisecond)))

	if len(report.VerdictBreakdown) > 0 {
		mdBuilder.WriteString("## Verdict Breakdown\n\n")
		mdBuilder.WriteString("| Verdict | Count |\n| --- | --- |\n")
		for v, count := range report.VerdictBreakdown {
			mdBuilder.WriteString(fmt.Sprintf("| %s | %d |\n", v, count))
		}
		mdBuilder.WriteString("\n")
	}

	if report.APIProbeMetrics != nil && report.APIProbeMetrics.TotalRequests > 0 {
		mdBuilder.WriteString("## Concurrent API Responsiveness Under Peak Load\n\n")
		mdBuilder.WriteString(fmt.Sprintf("- Tested Calls: `%d`\n", report.APIProbeMetrics.TotalRequests))
		mdBuilder.WriteString(fmt.Sprintf("- Successful: `%d`\n", report.APIProbeMetrics.SuccessCount))
		mdBuilder.WriteString(fmt.Sprintf("- Failed: `%d`\n", report.APIProbeMetrics.FailCount))
		mdBuilder.WriteString(fmt.Sprintf("- Average Response Time: `%s`\n", report.APIProbeMetrics.Average.Round(time.Millisecond)))
		mdBuilder.WriteString(fmt.Sprintf("- P95 Response Time: `%s`\n\n", report.APIProbeMetrics.P95.Round(time.Millisecond)))
	}

	_ = os.WriteFile(mdPath, []byte(mdBuilder.String()), 0644)

	// HTML Dashboard report
	htmlPath, _ := scenarios.GenerateHTMLReport(outputDir, report)

	fmt.Printf("Report exported to:\n")
	if htmlPath != "" {
		fmt.Printf("  - Dashboard HTML : %s\n", htmlPath)
	}
	fmt.Printf("  - Markdown       : %s\n", mdPath)
	fmt.Printf("  - JSON Raw Data  : %s\n", jsonPath)
}

func saveCredsCSV(path string, creds []scenarios.UserCredential) {
	var b strings.Builder
	b.WriteString("username,password\n")
	for _, c := range creds {
		b.WriteString(fmt.Sprintf("%s,%s\n", c.Username, c.Password))
	}
	_ = os.WriteFile(path, []byte(b.String()), 0600)
}
