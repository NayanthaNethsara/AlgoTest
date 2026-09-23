package scenarios

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type SandboxBurstConfig struct {
	BaseURL       string
	Sessions      []UserSession
	Concurrency   int
	TotalRequests int
	Language      string
	ProfileName   string
}

type SandboxRunRequest struct {
	Language string `json:"language"`
	Code     string `json:"code"`
	Stdin    string `json:"stdin"`
}

type SandboxRunResponse struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode"`
	TimeMs   int64  `json:"timeMs"`
	MemoryKB int64  `json:"memoryKb"`
	Verdict  string `json:"verdict"`
}

func RunSandboxBurst(ctx context.Context, config SandboxBurstConfig) (*TestExecutionReport, error) {
	client := &http.Client{Timeout: 45 * time.Second}
	cleanBaseURL := strings.TrimRight(config.BaseURL, "/")

	if len(config.Sessions) == 0 {
		return nil, fmt.Errorf("no user sessions available for sandbox burst test")
	}

	if config.TotalRequests <= 0 {
		config.TotalRequests = len(config.Sessions)
	}

	codePayload := getSampleCode(config.Language)
	stdinData := "10 20\n"

	tracker := NewLatencyTracker()
	concurrencyLimit := config.Concurrency
	if concurrencyLimit <= 0 {
		concurrencyLimit = 10
	}

	workerTokens := make(chan struct{}, concurrencyLimit)
	var waitGroup sync.WaitGroup

	startTime := time.Now()
	fmt.Printf("  Dispatching %d parallel sandbox runs (Concurrency limit: %d)...\n", config.TotalRequests, concurrencyLimit)

	for requestIndex := 0; requestIndex < config.TotalRequests; requestIndex++ {
		waitGroup.Add(1)
		session := config.Sessions[requestIndex%len(config.Sessions)]

		go func(sess UserSession) {
			defer waitGroup.Done()
			workerTokens <- struct{}{}
			defer func() { <-workerTokens }()

			payload, _ := json.Marshal(SandboxRunRequest{
				Language: config.Language,
				Code:     codePayload,
				Stdin:    stdinData,
			})

			req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, cleanBaseURL+"/api/v1/run", bytes.NewReader(payload))
			if reqErr != nil {
				tracker.Record(0, false)
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Cookie", "session="+sess.Token)

			t0 := time.Now()
			resp, doErr := client.Do(req)
			elapsed := time.Since(t0)

			if doErr != nil {
				tracker.Record(elapsed, false)
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusOK {
				var runResp SandboxRunResponse
				if json.NewDecoder(resp.Body).Decode(&runResp) == nil && runResp.ExitCode == 0 {
					tracker.Record(elapsed, true)
					return
				}
			} else {
				io.Copy(io.Discard, resp.Body)
			}

			tracker.Record(elapsed, false)
		}(session)
	}

	waitGroup.Wait()
	totalElapsed := time.Since(startTime)

	summary := tracker.ComputeSummary()
	throughput := 0.0
	if totalElapsed.Seconds() > 0 {
		throughput = float64(summary.SuccessCount) / totalElapsed.Seconds()
	}

	return &TestExecutionReport{
		Title:            "Sandbox /api/v1/run Burst Test",
		Timestamp:        time.Now().UTC().Format(time.RFC3339),
		TargetURL:        cleanBaseURL,
		ScenarioName:     "burst",
		ProfileName:      config.ProfileName,
		TotalUsers:       len(config.Sessions),
		ConcurrencyLimit: concurrencyLimit,
		ElapsedDuration:  totalElapsed,
		ThroughputRPS:    throughput,
		LatencyMetrics:   summary,
		AdditionalDetails: map[string]string{
			"TotalFired": fmt.Sprintf("%d", config.TotalRequests),
			"Language":   config.Language,
		},
	}, nil
}
