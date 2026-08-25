package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
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

func main() {
	var (
		baseURL      = flag.String("url", "http://localhost:8080", "Backend API base URL")
		usersCSV     = flag.String("users", "", "Path to CSV file containing username,password")
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

	codePayload := sampleCodeForLanguage(*language)

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
	fmt.Printf("Step 4: Waiting for judge workers to evaluate %d submissions...\n", len(submissionIDs))
	results := waitForVerdicts(httpClient, cleanBaseURL, sessions, submissionIDs, *pollInterval, *maxWait)
	totalDuration := time.Since(subStart)

	// 5. Output summary metrics
	summarizeResults(results, len(sessions), submissionFireDuration, totalDuration)
}

func ensureContestStarted(client *http.Client, baseURL, adminToken string) error {
	req, _ := http.NewRequest(http.MethodGet, baseURL+"/api/v1/admin/contest/state", nil)
	req.Header.Set("Cookie", "session="+adminToken)

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var state contestStateResponse
	if err := json.NewDecoder(resp.Body).Decode(&state); err == nil {
		if state.Status == "ended" {
			resetReq, _ := http.NewRequest(http.MethodPost, baseURL+"/api/v1/admin/contest/reset", nil)
			resetReq.Header.Set("Cookie", "session="+adminToken)
			if resetResp, err := client.Do(resetReq); err == nil {
				resetResp.Body.Close()
			}
			state.Status = "not_started"
		}

		if state.Status == "not_started" || state.Status == "paused" {
			startBody, _ := json.Marshal(map[string]int{"durationMinutes": 180})
			startReq, _ := http.NewRequest(http.MethodPost, baseURL+"/api/v1/admin/contest/start", bytes.NewReader(startBody))
			startReq.Header.Set("Content-Type", "application/json")
			startReq.Header.Set("Cookie", "session="+adminToken)

			startResp, startErr := client.Do(startReq)
			if startErr == nil {
				startResp.Body.Close()
				fmt.Printf("  Contest was '%s' -- automatically started timer for stress testing\n", state.Status)
			}
		}
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
	return "", fmt.Errorf("no problems found in admin portal")
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

	var problems []problemListItem
	if err := json.NewDecoder(resp.Body).Decode(&problems); err != nil {
		return "", err
	}
	if len(problems) == 0 {
		return "", fmt.Errorf("no published problems found in contest")
	}
	return problems[0].ID, nil
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

	for i, j := range jobs {
		wg.Add(1)
		go func(idx int, job submittedJob) {
			defer wg.Done()
			start := time.Now()
			ticker := time.NewTicker(pollInterval)
			defer ticker.Stop()

			for {
				select {
				case <-ctx.Done():
					results[idx] = judgedResult{
						username:     job.username,
						submissionID: job.submissionID,
						state:        "timed_out",
						err:          ctx.Err(),
					}
					return
				case <-ticker.C:
					req, _ := http.NewRequest(http.MethodGet, baseURL+"/api/v1/submissions/"+job.submissionID, nil)
					req.Header.Set("Cookie", "session="+job.token)

					resp, err := client.Do(req)
					if err != nil {
						continue
					}

					var status submissionStatusResponse
					decodeErr := json.NewDecoder(resp.Body).Decode(&status)
					resp.Body.Close()

					if decodeErr == nil && (status.Status == "passed" || status.Status == "failed" || status.Verdict != nil) {
						v := "UNKNOWN"
						if status.Verdict != nil {
							v = *status.Verdict
						}
						results[idx] = judgedResult{
							username:     job.username,
							submissionID: job.submissionID,
							state:        status.Status,
							verdict:      v,
							score:        status.Score,
							duration:     time.Since(start),
						}
						atomic.AddInt64(&completedCount, 1)
						return
					}
				}
			}
		}(i, j)
	}

	wg.Wait()
	return results
}

func summarizeResults(results []judgedResult, totalUsers int, ingestDuration, totalDuration time.Duration) {
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

	fmt.Printf("==================== STRESS TEST SUMMARY ====================\n")
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
	fmt.Printf("=============================================================\n")
}
