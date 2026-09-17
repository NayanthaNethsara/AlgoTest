package scenarios

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type QueuedJob struct {
	Username     string
	Token        string
	SubmissionID string
}

type SubmissionStressConfig struct {
	BaseURL        string
	Sessions       []UserSession
	AdminToken     string
	ProblemSlug    string
	Language       string
	PayloadMode    string
	Concurrency    int
	PollInterval   time.Duration
	MaxTimeout     time.Duration
	ProfileName    string
}

type SubmissionRequestPayload struct {
	ProblemID string `json:"problem_id"`
	Language  string `json:"language"`
	Code      string `json:"code"`
}

type SubmissionCreationResponse struct {
	ID            string `json:"id"`
	QueuePosition int    `json:"queue_position"`
	Status        string `json:"status"`
}

type SubmissionVerdictResponse struct {
	SubmissionID string  `json:"submissionId"`
	Status       string  `json:"status"`
	Verdict      *string `json:"verdict"`
	Score        int     `json:"score"`
	TestsDone    int     `json:"testsDone"`
	TestsTotal   int     `json:"testsTotal"`
}

func RunSubmissionStress(ctx context.Context, config SubmissionStressConfig) (*TestExecutionReport, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	cleanBaseURL := strings.TrimRight(config.BaseURL, "/")

	if len(config.Sessions) == 0 {
		return nil, fmt.Errorf("no user sessions available for submission stress test")
	}

	// 1. Resolve Target Problem
	problemID, err := resolveProblemID(client, cleanBaseURL, config.AdminToken, config.Sessions[0].Token, config.ProblemSlug)
	if err != nil {
		return nil, fmt.Errorf("problem resolution error: %w", err)
	}
	fmt.Printf("  Target Problem ID : %s\n", problemID)

	// 2. Ensure Contest is Active
	if config.AdminToken != "" {
		_ = ensureContestTimerActive(client, cleanBaseURL, config.AdminToken)
	}

	// 3. Start Background API Responsiveness Prober
	probeCtx, probeCancel := context.WithCancel(ctx)
	defer probeCancel()
	apiProbeTracker := startAPIProbe(probeCtx, cleanBaseURL, config.Sessions[0].Token)

	ingestTracker := NewLatencyTracker()

	var (
		submittedJobs []QueuedJob
		jobsMutex     sync.Mutex
		fireWaitGroup sync.WaitGroup
	)
	rejectionMap := make(map[string]int)

	var workerSemaphore chan struct{}
	if config.Concurrency > 0 {
		workerSemaphore = make(chan struct{}, config.Concurrency)
	}

	payloadMode := config.PayloadMode
	if payloadMode == "" {
		payloadMode = "mixed"
	}

	fmt.Printf("  Firing %d submissions concurrently (Concurrency cap: %d, Payload mode: %s)...\n", len(config.Sessions), config.Concurrency, payloadMode)
	fireStartTime := time.Now()

	for index, session := range config.Sessions {
		fireWaitGroup.Add(1)
		payload := SelectPayload(index, payloadMode, config.Language)

		go func(sess UserSession, targetPayload CodePayload) {
			defer fireWaitGroup.Done()
			if workerSemaphore != nil {
				workerSemaphore <- struct{}{}
				defer func() { <-workerSemaphore }()
			}

			payloadBytes, _ := json.Marshal(SubmissionRequestPayload{
				ProblemID: problemID,
				Language:  targetPayload.Language,
				Code:      targetPayload.Code,
			})

			req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, cleanBaseURL+"/api/v1/submissions", bytes.NewReader(payloadBytes))
			if reqErr != nil {
				ingestTracker.Record(0, false)
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Cookie", "session="+sess.Token)

			requestStart := time.Now()
			resp, doErr := client.Do(req)
			requestDuration := time.Since(requestStart)

			if doErr != nil {
				ingestTracker.Record(requestDuration, false)
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusAccepted {
				var created SubmissionCreationResponse
				if decodeErr := json.NewDecoder(resp.Body).Decode(&created); decodeErr == nil && created.ID != "" {
					ingestTracker.Record(requestDuration, true)
					jobsMutex.Lock()
					submittedJobs = append(submittedJobs, QueuedJob{
						Username:     sess.Username,
						Token:        sess.Token,
						SubmissionID: created.ID,
					})
					jobsMutex.Unlock()
					return
				}
			} else {
				respBody, _ := io.ReadAll(resp.Body)
				jobsMutex.Lock()
				rejectionMap[fmt.Sprintf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))]++
				jobsMutex.Unlock()
			}

			ingestTracker.Record(requestDuration, false)
		}(session, payload)
	}

	fireWaitGroup.Wait()
	ingestDuration := time.Since(fireStartTime)
	fmt.Printf("  Submissions accepted by API: %d / %d (ingestion took %s)\n", len(submittedJobs), len(config.Sessions), ingestDuration.Round(time.Millisecond))

	if len(rejectionMap) > 0 {
		fmt.Printf("  Rejection breakdown:\n")
		for reason, count := range rejectionMap {
			fmt.Printf("    [%d occurrences] %s\n", count, reason)
		}
	}

	if len(submittedJobs) == 0 {
		return nil, fmt.Errorf("zero submissions were accepted by the API")
	}

	// 4. Wait for Judge Evaluations (SSE + Fallback Polling)
	fmt.Printf("  Waiting for judge workers to grade %d submissions...\n", len(submittedJobs))
	judgeResults := waitForGrading(ctx, client, cleanBaseURL, submittedJobs, config.PollInterval, config.MaxTimeout)
	totalTestDuration := time.Since(fireStartTime)
	probeCancel()

	// 5. Aggregate Results
	verdictBreakdown := make(map[string]int)
	judgeLatencyTracker := NewLatencyTracker()

	for _, res := range judgeResults {
		if res.Error == nil && res.Status != "timed_out" {
			verdictBreakdown[res.Verdict]++
			judgeLatencyTracker.Record(res.Duration, true)
		} else {
			verdictBreakdown["TIMEOUT/ERROR"]++
			judgeLatencyTracker.Record(res.Duration, false)
		}
	}

	apiProbeSummary := apiProbeTracker.ComputeSummary()
	judgeLatencySummary := judgeLatencyTracker.ComputeSummary()

	effectiveThroughput := 0.0
	if totalTestDuration.Seconds() > 0 {
		effectiveThroughput = float64(judgeLatencySummary.SuccessCount) / totalTestDuration.Seconds()
	}

	return &TestExecutionReport{
		Title:            "Multi-User Submission Stress Test",
		Timestamp:        time.Now().UTC().Format(time.RFC3339),
		TargetURL:        cleanBaseURL,
		ScenarioName:     "submissions",
		ProfileName:      config.ProfileName,
		TotalUsers:       len(config.Sessions),
		ConcurrencyLimit: config.Concurrency,
		ElapsedDuration:  totalTestDuration,
		ThroughputRPS:    effectiveThroughput,
		LatencyMetrics:   judgeLatencySummary,
		VerdictBreakdown: verdictBreakdown,
		APIProbeMetrics:  &apiProbeSummary,
		AdditionalDetails: map[string]string{
			"IngestTime":     ingestDuration.Round(time.Millisecond).String(),
			"AcceptedRatio":  fmt.Sprintf("%d/%d", len(submittedJobs), len(config.Sessions)),
			"Language":       config.Language,
			"TargetProblem":  problemID,
		},
	}, nil
}

func waitForGrading(parentCtx context.Context, client *http.Client, baseURL string, jobs []QueuedJob, pollInterval, maxTimeout time.Duration) []JudgedSubmissionResult {
	results := make([]JudgedSubmissionResult, len(jobs))
	var completedCount int64
	var waitGroup sync.WaitGroup

	ctx, cancel := context.WithTimeout(parentCtx, maxTimeout)
	defer cancel()

	progressTicker := time.NewTicker(1 * time.Second)
	defer progressTicker.Stop()

	progressDone := make(chan struct{})
	go func() {
		defer close(progressDone)
		start := time.Now()
		for {
			select {
			case <-ctx.Done():
				return
			case <-progressTicker.C:
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

	for index, currentJob := range jobs {
		waitGroup.Add(1)
		go func(jobIndex int, targetJob QueuedJob) {
			defer waitGroup.Done()
			jobStart := time.Now()

			var once sync.Once
			recordResult := func(status, verdict string, score int, dur time.Duration, err error) {
				once.Do(func() {
					results[jobIndex] = JudgedSubmissionResult{
						Username:     targetJob.Username,
						SubmissionID: targetJob.SubmissionID,
						Status:       status,
						Verdict:      verdict,
						Score:        score,
						Duration:     dur,
						Error:        err,
					}
					if atomic.AddInt64(&completedCount, 1) == int64(len(jobs)) {
						cancel()
					}
				})
			}

			// First channel: SSE Stream Push
			sseFinished := make(chan bool, 1)
			go func() {
				sseReq, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v1/submissions/stream", nil)
				if err != nil {
					sseFinished <- false
					return
				}
				sseReq.Header.Set("Cookie", "session="+targetJob.Token)
				sseResp, err := client.Do(sseReq)
				if err != nil {
					sseFinished <- false
					return
				}
				defer sseResp.Body.Close()

				reader := bufio.NewReader(sseResp.Body)
				for {
					line, readErr := reader.ReadString('\n')
					if readErr != nil {
						sseFinished <- false
						return
					}
					line = strings.TrimSpace(line)
					if strings.HasPrefix(line, "data:") {
						payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
						var eventStatus SubmissionVerdictResponse
						if json.Unmarshal([]byte(payload), &eventStatus) == nil {
							if eventStatus.SubmissionID == targetJob.SubmissionID && (eventStatus.Status == "passed" || eventStatus.Status == "failed" || eventStatus.Verdict != nil) {
								v := "UNKNOWN"
								if eventStatus.Verdict != nil {
									v = *eventStatus.Verdict
								}
								recordResult(eventStatus.Status, v, eventStatus.Score, time.Since(jobStart), nil)
								sseFinished <- true
								return
							}
						}
					}
				}
			}()

			// Fallback Poller
			pollTicker := time.NewTicker(pollInterval)
			defer pollTicker.Stop()

			for {
				select {
				case <-ctx.Done():
					recordResult("timed_out", "TIMEOUT", 0, time.Since(jobStart), ctx.Err())
					return
				case isDone := <-sseFinished:
					if isDone {
						return
					}
				case <-pollTicker.C:
					req, _ := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v1/submissions/"+targetJob.SubmissionID, nil)
					req.Header.Set("Cookie", "session="+targetJob.Token)

					resp, err := client.Do(req)
					if err != nil {
						continue
					}

					var statusData SubmissionVerdictResponse
					decodeErr := json.NewDecoder(resp.Body).Decode(&statusData)
					resp.Body.Close()

					if decodeErr == nil {
						if statusData.Status == "passed" || statusData.Status == "failed" || statusData.Verdict != nil {
							v := "UNKNOWN"
							if statusData.Verdict != nil {
								v = *statusData.Verdict
							}
							recordResult(statusData.Status, v, statusData.Score, time.Since(jobStart), nil)
							return
						}
					}
				}
			}
		}(index, currentJob)
	}

	waitGroup.Wait()
	cancel()
	<-progressDone
	return results
}

func startAPIProbe(ctx context.Context, baseURL, sessionToken string) *LatencyTracker {
	tracker := NewLatencyTracker()
	probeClient := &http.Client{Timeout: 5 * time.Second}
	endpoints := []string{"/healthz", "/api/v1/contest/state", "/api/v1/problems"}

	go func() {
		ticker := time.NewTicker(250 * time.Millisecond)
		defer ticker.Stop()
		index := 0

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				ep := endpoints[index%len(endpoints)]
				index++

				req, _ := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+ep, nil)
				if sessionToken != "" && ep != "/healthz" {
					req.Header.Set("Cookie", "session="+sessionToken)
				}

				t0 := time.Now()
				resp, err := probeClient.Do(req)
				dur := time.Since(t0)

				if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
					return
				}

				isOK := err == nil && (resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusAccepted)
				tracker.Record(dur, isOK)
				if resp != nil {
					resp.Body.Close()
				}
			}
		}
	}()

	return tracker
}

func resolveProblemID(client *http.Client, baseURL, adminToken, userToken, requestedSlug string) (string, error) {
	if requestedSlug != "" {
		return requestedSlug, nil
	}

	// Try user problem list
	userReq, _ := http.NewRequest(http.MethodGet, baseURL+"/api/v1/problems", nil)
	userReq.Header.Set("Cookie", "session="+userToken)
	if resp, err := client.Do(userReq); err == nil && resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		var out struct {
			Problems []struct {
				ID        string `json:"id"`
				Published bool   `json:"published"`
			} `json:"problems"`
		}
		if json.NewDecoder(resp.Body).Decode(&out) == nil && len(out.Problems) > 0 {
			for _, p := range out.Problems {
				if p.Published {
					return p.ID, nil
				}
			}
			return out.Problems[0].ID, nil
		}
	}

	// Try admin problem list if available
	if adminToken != "" {
		adminReq, _ := http.NewRequest(http.MethodGet, baseURL+"/api/v1/admin/problems", nil)
		adminReq.Header.Set("Cookie", "session="+adminToken)
		if resp, err := client.Do(adminReq); err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var out struct {
				Problems []struct {
					ID        string `json:"id"`
					Published bool   `json:"published"`
				} `json:"problems"`
			}
			if json.NewDecoder(resp.Body).Decode(&out) == nil && len(out.Problems) > 0 {
				return out.Problems[0].ID, nil
			}
		}
	}

	return "", fmt.Errorf("no published problems found in contest")
}

func ensureContestTimerActive(client *http.Client, baseURL, adminToken string) error {
	req, _ := http.NewRequest(http.MethodGet, baseURL+"/api/v1/admin/contest/state", nil)
	req.Header.Set("Cookie", "session="+adminToken)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var state struct {
		Status string `json:"status"`
	}
	if json.NewDecoder(resp.Body).Decode(&state) == nil {
		upper := strings.ToUpper(strings.TrimSpace(state.Status))
		if upper == "ENDED" {
			resetReq, _ := http.NewRequest(http.MethodPost, baseURL+"/api/v1/admin/contest/reset", nil)
			resetReq.Header.Set("Cookie", "session="+adminToken)
			if r, e := client.Do(resetReq); e == nil {
				r.Body.Close()
			}
			upper = "NOT_STARTED"
		}
		if upper == "NOT_STARTED" || upper == "PAUSED" {
			startBody, _ := json.Marshal(map[string]int{"durationMinutes": 180})
			startReq, _ := http.NewRequest(http.MethodPost, baseURL+"/api/v1/admin/contest/start", bytes.NewReader(startBody))
			startReq.Header.Set("Content-Type", "application/json")
			startReq.Header.Set("Cookie", "session="+adminToken)
			if r, e := client.Do(startReq); e == nil {
				r.Body.Close()
			}
		}
	}
	return nil
}

func getSampleCode(lang string) string {
	switch strings.ToLower(lang) {
	case "python", "py":
		return "import sys\nfor line in sys.stdin:\n    nums = [int(x) for x in line.split() if x.isdigit()]\n    if nums:\n        print(sum(nums))\n"
	case "js", "javascript":
		return "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf-8');\nconst nums = input.trim().split(/\\s+/).map(Number).filter(n => !isNaN(n));\nif (nums.length >= 2) console.log(nums[0] + nums[1]);\n"
	default:
		return "#include <iostream>\nusing namespace std;\nint main(){\n    long long a, b;\n    while(cin >> a >> b) { cout << (a + b) << \"\\n\"; }\n    return 0;\n}\n"
	}
}
