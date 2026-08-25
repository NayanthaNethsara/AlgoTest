package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type userCredential struct {
	username string
	password string
}

type userSession struct {
	username string
	token    string
}

type submissionRequest struct {
	ProblemID string `json:"problem_id"`
	Language  string `json:"language"`
	Code      string `json:"code"`
}

type submissionResponse struct {
	ID            string `json:"id"`
	QueuePosition int    `json:"queue_position"`
	Status        string `json:"status"`
}

type submissionStatusResponse struct {
	SubmissionID string  `json:"submissionId"`
	Status       string  `json:"status"`
	Verdict      *string `json:"verdict"`
	Score        int     `json:"score"`
	TestsDone    int     `json:"testsDone"`
	TestsTotal   int     `json:"testsTotal"`
}

type problemListItem struct {
	ID        string `json:"id"`
	Slug      string `json:"slug"`
	Published bool   `json:"published"`
}

type contestStateResponse struct {
	Status string `json:"status"`
}

type latencyStats struct {
	totalRequests int64
	successCount  int64
	failCount     int64
	minLatency    time.Duration
	maxLatency    time.Duration
	totalLatency  time.Duration
	mu            sync.Mutex
}

func main() {
	var (
		baseURL      = flag.String("url", "http://localhost:8080", "Backend API base URL")
		usersCSV     = flag.String("users", "", "Path to CSV file containing username,password")
		saveUsers    = flag.String("save-users", "", "Path to save newly provisioned users CSV for future instant reuse")
		adminUser    = flag.String("admin", "", "Admin username to auto-provision test users")
		adminPass    = flag.String("admin-pass", "", "Admin password to auto-provision test users")
		userCount    = flag.Int("count", 20, "Number of test users to auto-create if -users is not specified")
		problemSlug  = flag.String("problem", "", "Problem slug or ID to submit against (if empty, uses the first published problem)")
		language     = flag.String("lang", "cpp", "Language to submit (cpp, python, js)")
		concurrency  = flag.Int("concurrency", 0, "Max concurrent submissions (0 = all users at once)")
		pollInterval = flag.Duration("poll", 1*time.Second, "Polling interval to check submission status")
		maxWait      = flag.Duration("timeout", 60*time.Second, "Max time to wait for all submissions to be judged")
	)
	flag.Parse()

	cleanBaseURL := strings.TrimRight(*baseURL, "/")
	httpClient := &http.Client{Timeout: 30 * time.Second}

	var creds []userCredential
	var adminToken string
	var err error

	if *adminUser != "" && *adminPass != "" {
		adminToken, err = adminLogin(httpClient, cleanBaseURL, *adminUser, *adminPass)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Admin authentication failed: %v\n", err)
			os.Exit(1)
		}
	}

	if *usersCSV != "" {
		creds, err = loadCredentials(*usersCSV)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to load users from CSV: %v\n", err)
			os.Exit(1)
		}
	} else if adminToken != "" {
		fmt.Printf("== Auto-Provisioning %d Temporary Test Users ==\n", *userCount)
		creds, err = autoProvisionUsers(httpClient, cleanBaseURL, adminToken, *userCount)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to auto-provision users: %v\n", err)
			os.Exit(1)
		}
		if *saveUsers != "" {
			if saveErr := saveCredentials(*saveUsers, creds); saveErr == nil {
				fmt.Printf("  Saved %d test user credentials to '%s' for future instant reuse\n", len(creds), *saveUsers)
			}
		}
	} else {
		fmt.Fprintln(os.Stderr, "Error: You must provide either:")
		fmt.Fprintln(os.Stderr, "  1) -users <csv-file>")
		fmt.Fprintln(os.Stderr, "  OR")
		fmt.Fprintln(os.Stderr, "  2) -admin <admin_user> -admin-pass <admin_pass> (optional: -count 50)")
		os.Exit(1)
	}

	if len(creds) == 0 {
		fmt.Fprintln(os.Stderr, "No valid credentials found or created.")
		os.Exit(1)
	}

	// Ensure contest is active
	if adminToken != "" {
		if err := ensureContestStarted(httpClient, cleanBaseURL, adminToken); err != nil {
			fmt.Fprintf(os.Stderr, "Notice: could not auto-start contest: %v\n", err)
		}
	}

	fmt.Printf("\n== Starting Multi-User Submission Stress Test ==\n")
	fmt.Printf("  Target URL : %s\n", cleanBaseURL)
	fmt.Printf("  Users count: %d\n", len(creds))
	fmt.Printf("  Language   : %s\n\n", *language)

	// 1. Authenticate all users
	fmt.Printf("Step 1: Logging in %d users concurrently...\n", len(creds))
	loginStart := time.Now()
	sessions := authenticateUsers(httpClient, cleanBaseURL, creds)
	loginDuration := time.Since(loginStart)

	if len(sessions) == 0 {
		fmt.Fprintln(os.Stderr, "All user logins failed. Aborting.")
		os.Exit(1)
	}
	fmt.Printf("  Logins completed: %d / %d successful (took %s)\n\n", len(sessions), len(creds), loginDuration.Round(time.Millisecond))

	// 2. Discover target problem
	targetProblemID := *problemSlug
	if targetProblemID == "" {
		if adminToken != "" {
			targetProblemID, err = findFirstPublishedProblemAdmin(httpClient, cleanBaseURL, adminToken)
		} else {
			targetProblemID, err = findFirstPublishedProblem(httpClient, cleanBaseURL, sessions[0].token)
		}
		if err != nil {
			fmt.Fprintf(os.Stderr, "Could not discover published problem: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Step 2: Auto-selected published problem ID: %s\n\n", targetProblemID)
	} else {
		fmt.Printf("Step 2: Using target problem: %s\n\n", targetProblemID)
	}

	// Ensure contest is active now that problem exists
	if adminToken != "" {
		if err := ensureContestStarted(httpClient, cleanBaseURL, adminToken); err != nil {
			fmt.Fprintf(os.Stderr, "Notice: could not auto-start contest: %v\n", err)
		}
	}

	codePayload := sampleCodeForLanguage(*language)

	// Start Background API Responsiveness Prober
	probeCtx, probeCancel := context.WithCancel(context.Background())
	defer probeCancel()
	apiProbe := startAPIResponsivenessProber(probeCtx, cleanBaseURL, sessions[0].token)

	// 3. Fire submissions
	fmt.Printf("Step 3: Submitting code concurrently for %d users...\n", len(sessions))
	subStart := time.Now()
	submissionIDs, firstError := fireSubmissions(httpClient, cleanBaseURL, sessions, targetProblemID, *language, codePayload, *concurrency)
	submissionFireDuration := time.Since(subStart)

	fmt.Printf("  Submissions accepted by API: %d / %d (ingest took %s)\n\n",
		len(submissionIDs), len(sessions), submissionFireDuration.Round(time.Millisecond))

	if len(submissionIDs) == 0 {
		if firstError != "" {
			fmt.Fprintf(os.Stderr, "API rejection details: %s\n", firstError)
		}
		fmt.Fprintln(os.Stderr, "Zero submissions were accepted by the API.")
		os.Exit(1)
	}

	// 4. Poll / Wait for judge evaluations
	fmt.Printf("Step 4: Waiting for judge workers to evaluate %d submissions (with concurrent API health probe)...\n", len(submissionIDs))
	results := waitForVerdicts(httpClient, cleanBaseURL, sessions, submissionIDs, *pollInterval, *maxWait)
	totalDuration := time.Since(subStart)
	probeCancel()

	// 5. Output summary metrics
	summarizeResults(results, len(sessions), submissionFireDuration, totalDuration, apiProbe)
}

func startAPIResponsivenessProber(ctx context.Context, baseURL, token string) *latencyStats {
	stats := &latencyStats{minLatency: 999 * time.Second}
	client := &http.Client{Timeout: 5 * time.Second}

	endpoints := []string{
		"/healthz",
		"/api/v1/contest/state",
		"/api/v1/problems",
	}

	go func() {
		ticker := time.NewTicker(200 * time.Millisecond)
		defer ticker.Stop()
		var epIdx int

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				ep := endpoints[epIdx%len(endpoints)]
				epIdx++

				req, _ := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+ep, nil)
				if token != "" && ep != "/healthz" {
					req.Header.Set("Cookie", "session="+token)
				}

				t0 := time.Now()
				resp, err := client.Do(req)
				latency := time.Since(t0)

				stats.mu.Lock()
				if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
					stats.mu.Unlock()
					return
				}
				stats.totalRequests++
				if err == nil && (resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusAccepted) {
					stats.successCount++
					stats.totalLatency += latency
					if latency < stats.minLatency {
						stats.minLatency = latency
					}
					if latency > stats.maxLatency {
						stats.maxLatency = latency
					}
					resp.Body.Close()
				} else {
					stats.failCount++
					if resp != nil {
						resp.Body.Close()
					}
				}
				stats.mu.Unlock()
			}
		}
	}()

	return stats
}

func ensureContestStarted(client *http.Client, baseURL, adminToken string) error {
	req, _ := http.NewRequest(http.MethodGet, baseURL+"/api/v1/admin/contest/state", nil)
	req.Header.Set("Cookie", "session="+adminToken)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("query contest state: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("query contest state HTTP %d: %s", resp.StatusCode, string(b))
	}

	var state contestStateResponse
	if err := json.NewDecoder(resp.Body).Decode(&state); err != nil {
		return fmt.Errorf("decode contest state: %w", err)
	}

	statusUpper := strings.ToUpper(strings.TrimSpace(state.Status))

	if statusUpper == "ENDED" {
		resetReq, _ := http.NewRequest(http.MethodPost, baseURL+"/api/v1/admin/contest/reset", nil)
		resetReq.Header.Set("Cookie", "session="+adminToken)
		if resetResp, err := client.Do(resetReq); err == nil {
			resetResp.Body.Close()
		}
		statusUpper = "NOT_STARTED"
	}

	if statusUpper == "NOT_STARTED" || statusUpper == "PAUSED" {
		startBody, _ := json.Marshal(map[string]int{"durationMinutes": 180})
		startReq, _ := http.NewRequest(http.MethodPost, baseURL+"/api/v1/admin/contest/start", bytes.NewReader(startBody))
		startReq.Header.Set("Content-Type", "application/json")
		startReq.Header.Set("Cookie", "session="+adminToken)

		startResp, startErr := client.Do(startReq)
		if startErr != nil {
			return fmt.Errorf("start contest request: %w", startErr)
		}
		defer startResp.Body.Close()

		if startResp.StatusCode == http.StatusOK {
			fmt.Printf("  Contest was '%s' -- automatically started timer\n", state.Status)
		} else {
			b, _ := io.ReadAll(startResp.Body)
			return fmt.Errorf("start contest HTTP %d: %s", startResp.StatusCode, string(b))
		}
	} else {
		fmt.Printf("  Contest state is '%s' (active)\n", state.Status)
	}
	return nil
}

func adminLogin(client *http.Client, baseURL, user, pass string) (string, error) {
	loginBody, _ := json.Marshal(map[string]string{
		"username": user,
		"password": pass,
	})
	resp, err := client.Post(baseURL+"/api/v1/auth/login", "application/json", bytes.NewReader(loginBody))
	if err != nil {
		return "", fmt.Errorf("admin login request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("admin login failed (HTTP %d): %s", resp.StatusCode, string(b))
	}

	var loginOut struct {
		SessionToken string `json:"sessionToken"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&loginOut); err != nil || loginOut.SessionToken == "" {
		return "", fmt.Errorf("could not decode admin session token")
	}
	return loginOut.SessionToken, nil
}

func autoProvisionUsers(client *http.Client, baseURL, adminToken string, count int) ([]userCredential, error) {
	type createReq struct {
		Username    string `json:"username"`
		DisplayName string `json:"displayName"`
		Password    string `json:"password"`
		TeamID      string `json:"teamId"`
	}

	type bulkResult struct {
		Username string `json:"username"`
		Status   string `json:"status"`
		Error    string `json:"error,omitempty"`
		User     struct {
			ID string `json:"id"`
		} `json:"user"`
	}

	var createdCreds []userCredential
	batchSuffix := time.Now().Unix() % 100000
	const usersPerTeam = 3

	numTeams := (count + usersPerTeam - 1) / usersPerTeam

	for t := 1; t <= numTeams; t++ {
		teamName := fmt.Sprintf("StressTeam_%d_%02d", batchSuffix, t)
		teamReqBody, _ := json.Marshal(map[string]string{"name": teamName})
		teamReq, _ := http.NewRequest(http.MethodPost, baseURL+"/api/v1/admin/teams", bytes.NewReader(teamReqBody))
		teamReq.Header.Set("Content-Type", "application/json")
		teamReq.Header.Set("Cookie", "session="+adminToken)

		teamResp, err := client.Do(teamReq)
		if err != nil {
			return nil, fmt.Errorf("create team %s failed: %w", teamName, err)
		}
		var teamOut struct {
			Team struct {
				ID string `json:"id"`
			} `json:"team"`
		}
		_ = json.NewDecoder(teamResp.Body).Decode(&teamOut)
		teamResp.Body.Close()
		teamID := teamOut.Team.ID

		var batchUsers []createReq
		var batchCreds []userCredential

		startIndex := (t-1)*usersPerTeam + 1
		endIndex := t * usersPerTeam
		if endIndex > count {
			endIndex = count
		}

		for i := startIndex; i <= endIndex; i++ {
			u := fmt.Sprintf("stresstest_%d_%03d", batchSuffix, i)
			p := "StressPass_123!"
			batchUsers = append(batchUsers, createReq{
				Username:    u,
				DisplayName: fmt.Sprintf("Stress User %d", i),
				Password:    p,
				TeamID:      teamID,
			})
			batchCreds = append(batchCreds, userCredential{username: u, password: p})
		}

		bulkBody, _ := json.Marshal(map[string]any{
			"teamId": teamID,
			"users":  batchUsers,
		})

		bulkReq, _ := http.NewRequest(http.MethodPost, baseURL+"/api/v1/admin/users/bulk", bytes.NewReader(bulkBody))
		bulkReq.Header.Set("Content-Type", "application/json")
		bulkReq.Header.Set("Cookie", "session="+adminToken)

		bulkResp, err := client.Do(bulkReq)
		if err != nil {
			return nil, fmt.Errorf("bulk create failed for team %s: %w", teamName, err)
		}

		var bulkOut struct {
			Results []bulkResult `json:"results"`
		}
		_ = json.NewDecoder(bulkResp.Body).Decode(&bulkOut)
		bulkResp.Body.Close()

		for _, r := range bulkOut.Results {
			if r.Status == "created" && r.User.ID != "" {
				accessBody, _ := json.Marshal(map[string]any{
					"webWithAgent": true,
					"webOnly":      true,
					"reason":       "automated stress testing grant",
					"hoursValid":   4,
				})
				accessReq, _ := http.NewRequest(http.MethodPatch, baseURL+"/api/v1/admin/users/"+r.User.ID+"/access", bytes.NewReader(accessBody))
				accessReq.Header.Set("Content-Type", "application/json")
				accessReq.Header.Set("Cookie", "session="+adminToken)
				if accResp, accErr := client.Do(accessReq); accErr == nil {
					accResp.Body.Close()
				}
			}
		}

		createdCreds = append(createdCreds, batchCreds...)
	}

	fmt.Printf("  Successfully provisioned %d test accounts across %d teams\n", len(createdCreds), numTeams)
	return createdCreds, nil
}

func loadCredentials(path string) ([]userCredential, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	r := csv.NewReader(f)
	records, err := r.ReadAll()
	if err != nil {
		return nil, err
	}

	var creds []userCredential
	for _, row := range records {
		if len(row) < 2 {
			continue
		}
		user := strings.TrimSpace(row[0])
		pass := strings.TrimSpace(row[1])
		if user == "" || strings.EqualFold(user, "username") {
			continue
		}
		creds = append(creds, userCredential{username: user, password: pass})
	}
	return creds, nil
}

func saveCredentials(path string, creds []userCredential) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	w := csv.NewWriter(f)
	defer w.Flush()

	_ = w.Write([]string{"username", "password"})
	for _, c := range creds {
		_ = w.Write([]string{c.username, c.password})
	}
	return nil
}

func authenticateUsers(client *http.Client, baseURL string, creds []userCredential) []userSession {
	var (
		sessions []userSession
		mu       sync.Mutex
		wg       sync.WaitGroup
	)

	limitCh := make(chan struct{}, 8)

	for _, c := range creds {
		wg.Add(1)
		go func(cred userCredential) {
			defer wg.Done()
			limitCh <- struct{}{}
			defer func() { <-limitCh }()

			for retry := 0; retry < 3; retry++ {
				body, _ := json.Marshal(map[string]string{
					"username": cred.username,
					"password": cred.password,
				})

				req, _ := http.NewRequest(http.MethodPost, baseURL+"/api/v1/auth/login", bytes.NewReader(body))
				req.Header.Set("Content-Type", "application/json")

				resp, err := client.Do(req)
				if err != nil {
					time.Sleep(200 * time.Millisecond)
					continue
				}

				if resp.StatusCode == http.StatusOK {
					var out struct {
						SessionToken string `json:"sessionToken"`
					}
					if err := json.NewDecoder(resp.Body).Decode(&out); err == nil && out.SessionToken != "" {
						resp.Body.Close()
						mu.Lock()
						sessions = append(sessions, userSession{username: cred.username, token: out.SessionToken})
						mu.Unlock()
						return
					}
				}
				resp.Body.Close()
				time.Sleep(300 * time.Millisecond)
			}
		}(c)
	}

	wg.Wait()
	return sessions
}

func findFirstPublishedProblemAdmin(client *http.Client, baseURL, adminToken string) (string, error) {
	req, _ := http.NewRequest(http.MethodGet, baseURL+"/api/v1/admin/problems", nil)
	req.Header.Set("Cookie", "session="+adminToken)

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("admin problems HTTP %d: %s", resp.StatusCode, string(b))
	}

	var out struct {
		Problems []problemListItem `json:"problems"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	for _, p := range out.Problems {
		if p.Published {
			return p.ID, nil
		}
	}
	if len(out.Problems) > 0 {
		return out.Problems[0].ID, nil
	}

	// Auto-create a sample problem on fresh database
	return createSampleProblem(client, baseURL, adminToken)
}

func createSampleProblem(client *http.Client, baseURL, adminToken string) (string, error) {
	fmt.Printf("  No problems found in fresh database -- auto-creating test problem 'Sum of Two Numbers'...\n")
	probBody, _ := json.Marshal(map[string]any{
		"title":         "Sum of Two Numbers",
		"slug":          fmt.Sprintf("sum-numbers-%d", time.Now().Unix()%10000),
		"statement":     "Given two integers A and B, compute and print their sum.",
		"difficulty":    "easy",
		"timeLimitMs":   2000,
		"memoryLimitMb": 256,
		"published":     true,
		"samples": []map[string]any{
			{"ordinal": 1, "input": "2 3\n", "output": "5\n"},
		},
		"tests": []map[string]any{
			{"ordinal": 1, "input": "10 20\n", "expected": "30\n", "points": 20},
			{"ordinal": 2, "input": "100 250\n", "expected": "350\n", "points": 20},
			{"ordinal": 3, "input": "999 1\n", "expected": "1000\n", "points": 20},
			{"ordinal": 4, "input": "50 50\n", "expected": "100\n", "points": 20},
			{"ordinal": 5, "input": "123 456\n", "expected": "579\n", "points": 20},
		},
	})
	probReq, _ := http.NewRequest(http.MethodPost, baseURL+"/api/v1/admin/problems", bytes.NewReader(probBody))
	probReq.Header.Set("Content-Type", "application/json")
	probReq.Header.Set("Cookie", "session="+adminToken)

	probResp, err := client.Do(probReq)
	if err != nil {
		return "", fmt.Errorf("create sample problem: %w", err)
	}
	defer probResp.Body.Close()

	if probResp.StatusCode != http.StatusCreated && probResp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(probResp.Body)
		return "", fmt.Errorf("create problem HTTP %d: %s", probResp.StatusCode, string(b))
	}

	var probOut struct {
		Problem struct {
			ID string `json:"id"`
		} `json:"problem"`
	}
	if err := json.NewDecoder(probResp.Body).Decode(&probOut); err != nil || probOut.Problem.ID == "" {
		return "", fmt.Errorf("could not decode created problem ID")
	}

	return probOut.Problem.ID, nil
}

func findFirstPublishedProblem(client *http.Client, baseURL, token string) (string, error) {
	req, _ := http.NewRequest(http.MethodGet, baseURL+"/api/v1/problems", nil)
	req.Header.Set("Cookie", "session="+token)

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(b))
	}

	var out struct {
		Problems []problemListItem `json:"problems"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if len(out.Problems) == 0 {
		return "", fmt.Errorf("no published problems found in contest")
	}
	return out.Problems[0].ID, nil
}

func sampleCodeForLanguage(lang string) string {
	switch strings.ToLower(lang) {
	case "python", "py":
		return "import sys\nfor line in sys.stdin:\n    nums = [int(x) for x in line.split() if x.isdigit()]\n    if nums:\n        print(sum(nums))\n"
	case "js", "javascript":
		return "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf-8');\nconst nums = input.trim().split(/\\s+/).map(Number).filter(n => !isNaN(n));\nif (nums.length >= 2) console.log(nums[0] + nums[1]);\n"
	default:
		return "#include <iostream>\nusing namespace std;\nint main(){\n    long long a, b;\n    while(cin >> a >> b) { cout << (a + b) << \"\\n\"; }\n    return 0;\n}\n"
	}
}

type submittedJob struct {
	username     string
	token        string
	submissionID string
}

func fireSubmissions(client *http.Client, baseURL string, sessions []userSession, problemID, lang, code string, maxConcurrency int) ([]submittedJob, string) {
	var (
		jobs       []submittedJob
		firstError string
		mu         sync.Mutex
		wg         sync.WaitGroup
	)

	var limitCh chan struct{}
	if maxConcurrency > 0 {
		limitCh = make(chan struct{}, maxConcurrency)
	}

	for _, s := range sessions {
		wg.Add(1)
		go func(sess userSession) {
			defer wg.Done()
			if limitCh != nil {
				limitCh <- struct{}{}
				defer func() { <-limitCh }()
			}

			payload, _ := json.Marshal(submissionRequest{
				ProblemID: problemID,
				Language:  lang,
				Code:      code,
			})

			req, _ := http.NewRequest(http.MethodPost, baseURL+"/api/v1/submissions", bytes.NewReader(payload))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Cookie", "session="+sess.token)

			resp, err := client.Do(req)
			if err != nil {
				mu.Lock()
				if firstError == "" {
					firstError = fmt.Sprintf("Network error: %v", err)
				}
				mu.Unlock()
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusAccepted || resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
				var out submissionResponse
				if err := json.NewDecoder(resp.Body).Decode(&out); err == nil && out.ID != "" {
					mu.Lock()
					jobs = append(jobs, submittedJob{
						username:     sess.username,
						token:        sess.token,
						submissionID: out.ID,
					})
					mu.Unlock()
				}
			} else {
				b, _ := io.ReadAll(resp.Body)
				mu.Lock()
				if firstError == "" {
					firstError = fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(b))
				}
				mu.Unlock()
			}
		}(s)
	}

	wg.Wait()
	return jobs, firstError
}

type judgedResult struct {
	username     string
	submissionID string
	state        string
	verdict      string
	score        int
	duration     time.Duration
	err          error
}

func waitForVerdicts(client *http.Client, baseURL string, sessions []userSession, jobs []submittedJob, pollInterval, maxWait time.Duration) []judgedResult {
	results := make([]judgedResult, len(jobs))
	var wg sync.WaitGroup

	ctx, cancel := context.WithTimeout(context.Background(), maxWait)
	defer cancel()

	var completedCount int64

	// Live progress reporter
	progressDone := make(chan struct{})
	go func() {
		defer close(progressDone)
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()
		start := time.Now()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				done := atomic.LoadInt64(&completedCount)
				pct := float64(done) / float64(len(jobs)) * 100.0
				elapsed := time.Since(start).Round(time.Second)
				fmt.Printf("  [%3s] Graded %d / %d submissions (%.1f%%)\n", elapsed, done, len(jobs), pct)
				if int(done) == len(jobs) {
					return
				}
			}
		}
	}()

	for i, j := range jobs {
		wg.Add(1)
		go func(idx int, job submittedJob) {
			defer wg.Done()
			start := time.Now()

			var once sync.Once
			recordResult := func(status, verdict string, score int, dur time.Duration) {
				once.Do(func() {
					results[idx] = judgedResult{
						username:     job.username,
						submissionID: job.submissionID,
						state:        status,
						verdict:      verdict,
						score:        score,
						duration:     dur,
					}
					if atomic.AddInt64(&completedCount, 1) == int64(len(jobs)) {
						cancel()
					}
				})
			}

			// First, try SSE stream listener for instant verdict push
			sseDone := make(chan bool, 1)
			go func() {
				sseReq, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v1/submissions/stream", nil)
				if err != nil {
					sseDone <- false
					return
				}
				sseReq.Header.Set("Cookie", "session="+job.token)
				sseResp, err := client.Do(sseReq)
				if err != nil {
					sseDone <- false
					return
				}
				defer sseResp.Body.Close()

				reader := bufio.NewReader(sseResp.Body)
				for {
					line, readErr := reader.ReadString('\n')
					if readErr != nil {
						sseDone <- false
						return
					}
					line = strings.TrimSpace(line)
					if strings.HasPrefix(line, "data:") {
						data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
						var st submissionStatusResponse
						if json.Unmarshal([]byte(data), &st) == nil {
							if st.SubmissionID == job.submissionID && (st.Status == "passed" || st.Status == "failed" || st.Verdict != nil) {
								v := "UNKNOWN"
								if st.Verdict != nil {
									v = *st.Verdict
								}
								recordResult(st.Status, v, st.Score, time.Since(start))
								sseDone <- true
								return
							}
						}
					}
				}
			}()

			// Lightweight fallback polling
			ticker := time.NewTicker(pollInterval)
			defer ticker.Stop()

			for {
				select {
				case <-ctx.Done():
					once.Do(func() {
						results[idx] = judgedResult{
							username:     job.username,
							submissionID: job.submissionID,
							state:        "timed_out",
							err:          ctx.Err(),
						}
					})
					return
				case finishedViaSSE := <-sseDone:
					if finishedViaSSE {
						return
					}
				case <-ticker.C:
					req, _ := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v1/submissions/"+job.submissionID, nil)
					req.Header.Set("Cookie", "session="+job.token)

					resp, err := client.Do(req)
					if err != nil {
						continue
					}

					var status submissionStatusResponse
					decodeErr := json.NewDecoder(resp.Body).Decode(&status)
					resp.Body.Close()

					if decodeErr == nil {
						if status.Status == "passed" || status.Status == "failed" || status.Verdict != nil {
							v := "UNKNOWN"
							if status.Verdict != nil {
								v = *status.Verdict
							}
							recordResult(status.Status, v, status.Score, time.Since(start))
							return
						} else if time.Since(start) > 6*time.Second && time.Since(start) < 8*time.Second {
							fmt.Printf("  [DIAG] Trailing sub %s (user %s): status='%s', score=%d\n", job.submissionID, job.username, status.Status, status.Score)
						}
					}
				}
			}
		}(i, j)
	}

	wg.Wait()
	cancel()
	<-progressDone
	return results
}

func summarizeResults(results []judgedResult, totalUsers int, ingestDuration, totalDuration time.Duration, apiProbe *latencyStats) {
	verdictCounts := make(map[string]int)
	var completed int
	var totalJudgeLatency time.Duration

	for _, r := range results {
		if r.err == nil && r.state != "timed_out" {
			completed++
			verdictCounts[r.verdict]++
			totalJudgeLatency += r.duration
		} else {
			verdictCounts["TIMEOUT/ERROR"]++
		}
	}

	fmt.Printf("\n==================== STRESS TEST SUMMARY ====================\n")
	fmt.Printf("  Total Contestant Accounts : %d\n", totalUsers)
	fmt.Printf("  Submissions Graded        : %d / %d (%.1f%%)\n", completed, len(results), float64(completed)/float64(len(results))*100)
	fmt.Printf("  Submission Ingest Time    : %s\n", ingestDuration.Round(time.Millisecond))
	fmt.Printf("  Total Test Completion Time: %s\n", totalDuration.Round(time.Millisecond))

	if completed > 0 {
		avgLatency := totalJudgeLatency / time.Duration(completed)
		throughput := float64(completed) / totalDuration.Seconds()
		fmt.Printf("  Average Judge Wait Latency: %s\n", avgLatency.Round(time.Millisecond))
		fmt.Printf("  Effective Judge Throughput: %.2f submissions/sec (%.0f submissions/min)\n", throughput, throughput*60)
	}

	fmt.Printf("\nVerdict Breakdown:\n")
	for v, count := range verdictCounts {
		fmt.Printf("  %-15s : %d\n", v, count)
	}

	if apiProbe != nil {
		apiProbe.mu.Lock()
		defer apiProbe.mu.Unlock()
		fmt.Printf("\n--- Concurrent API Responsiveness Under Peak Judging Load ---\n")
		fmt.Printf("  Probed API Calls Tested   : %d requests (/healthz, /contest/state, /problems)\n", apiProbe.totalRequests)
		fmt.Printf("  Successful HTTP Responses : %d / %d\n", apiProbe.successCount, apiProbe.totalRequests)
		fmt.Printf("  Failed / Stalled Requests : %d\n", apiProbe.failCount)
		if apiProbe.successCount > 0 {
			avgAPI := apiProbe.totalLatency / time.Duration(apiProbe.successCount)
			fmt.Printf("  Min API Response Latency  : %s\n", apiProbe.minLatency.Round(time.Millisecond))
			fmt.Printf("  Avg API Response Latency  : %s\n", avgAPI.Round(time.Millisecond))
			fmt.Printf("  Max API Response Latency  : %s\n", apiProbe.maxLatency.Round(time.Millisecond))
		}
	}
	fmt.Printf("=============================================================\n")
}
