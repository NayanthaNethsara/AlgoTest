package scenarios

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type GatewayReadConfig struct {
	BaseURL     string
	Sessions    []UserSession
	Duration    time.Duration
	Concurrency int
	Endpoints   []string
	ProfileName string
}

func RunGatewayRead(ctx context.Context, config GatewayReadConfig) (*TestExecutionReport, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	cleanBaseURL := strings.TrimRight(config.BaseURL, "/")

	endpoints := config.Endpoints
	if len(endpoints) == 0 {
		if len(config.Sessions) > 0 {
			endpoints = []string{
				"/healthz",
				"/api/v1/contest/state",
				"/api/v1/problems",
				"/api/v1/leaderboard",
			}
		} else {
			endpoints = []string{
				"/healthz",
				"/api/v1/contest/state",
			}
		}
	}

	concurrencyLimit := config.Concurrency
	if concurrencyLimit <= 0 {
		concurrencyLimit = 20
	}

	testDuration := config.Duration
	if testDuration <= 0 {
		testDuration = 10 * time.Second
	}

	tracker := NewLatencyTracker()
	testCtx, cancel := context.WithTimeout(ctx, testDuration)
	defer cancel()

	var waitGroup sync.WaitGroup
	var requestCounter int64

	startTime := time.Now()
	fmt.Printf("  Running HTTP Read Benchmark for %s (Concurrency: %d virtual users)...\n", testDuration, concurrencyLimit)

	for workerID := 0; workerID < concurrencyLimit; workerID++ {
		waitGroup.Add(1)
		var userSessionToken string
		if len(config.Sessions) > 0 {
			userSessionToken = config.Sessions[workerID%len(config.Sessions)].Token
		}

		go func(token string) {
			defer waitGroup.Done()
			localIndex := 0

			for {
				select {
				case <-testCtx.Done():
					return
				default:
					ep := endpoints[localIndex%len(endpoints)]
					localIndex++

					req, reqErr := http.NewRequestWithContext(testCtx, http.MethodGet, cleanBaseURL+ep, nil)
					if reqErr != nil {
						continue
					}
					if token != "" && ep != "/healthz" {
						req.Header.Set("Cookie", "session="+token)
					}

					t0 := time.Now()
					resp, doErr := client.Do(req)
					elapsed := time.Since(t0)

					atomic.AddInt64(&requestCounter, 1)

					if doErr != nil {
						if testCtx.Err() == nil {
							tracker.Record(elapsed, false)
						}
						continue
					}

					io.Copy(io.Discard, resp.Body)
					resp.Body.Close()

					isSuccess := resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusAccepted
					tracker.Record(elapsed, isSuccess)
				}
			}
		}(userSessionToken)
	}

	waitGroup.Wait()
	actualDuration := time.Since(startTime)

	summary := tracker.ComputeSummary()
	throughput := 0.0
	if actualDuration.Seconds() > 0 {
		throughput = float64(summary.TotalRequests) / actualDuration.Seconds()
	}

	return &TestExecutionReport{
		Title:            "High-Throughput Gateway Read Benchmark",
		Timestamp:        time.Now().UTC().Format(time.RFC3339),
		TargetURL:        cleanBaseURL,
		ScenarioName:     "read",
		ProfileName:      config.ProfileName,
		TotalUsers:       len(config.Sessions),
		ConcurrencyLimit: concurrencyLimit,
		ElapsedDuration:  actualDuration,
		ThroughputRPS:    throughput,
		LatencyMetrics:   summary,
		AdditionalDetails: map[string]string{
			"Endpoints": fmt.Sprintf("%v", endpoints),
			"Duration":  testDuration.String(),
		},
	}, nil
}
