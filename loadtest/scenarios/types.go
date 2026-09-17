package scenarios

import (
	"sort"
	"sync"
	"time"
)

type UserCredential struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type UserSession struct {
	Username string `json:"username"`
	Token    string `json:"token"`
	UserID   string `json:"userId,omitempty"`
}

type LatencyTracker struct {
	mu           sync.Mutex
	durations    []time.Duration
	successCount int64
	failCount    int64
	totalLatency time.Duration
	minLatency   time.Duration
	maxLatency   time.Duration
}

func NewLatencyTracker() *LatencyTracker {
	return &LatencyTracker{
		durations:  make([]time.Duration, 0, 1024),
		minLatency: 999 * time.Hour,
	}
}

func (tracker *LatencyTracker) Record(duration time.Duration, isSuccess bool) {
	tracker.mu.Lock()
	defer tracker.mu.Unlock()

	if isSuccess {
		tracker.successCount++
		tracker.durations = append(tracker.durations, duration)
		tracker.totalLatency += duration
		if duration < tracker.minLatency {
			tracker.minLatency = duration
		}
		if duration > tracker.maxLatency {
			tracker.maxLatency = duration
		}
	} else {
		tracker.failCount++
	}
}

type LatencySummary struct {
	TotalRequests int64         `json:"totalRequests"`
	SuccessCount  int64         `json:"successCount"`
	FailCount     int64         `json:"failCount"`
	Min           time.Duration `json:"min"`
	Max           time.Duration `json:"max"`
	Average       time.Duration `json:"average"`
	P50           time.Duration `json:"p50"`
	P90           time.Duration `json:"p90"`
	P95           time.Duration `json:"p95"`
	P99           time.Duration `json:"p99"`
}

func (tracker *LatencyTracker) ComputeSummary() LatencySummary {
	tracker.mu.Lock()
	defer tracker.mu.Unlock()

	totalRequests := tracker.successCount + tracker.failCount
	if tracker.successCount == 0 {
		return LatencySummary{
			TotalRequests: totalRequests,
			FailCount:     tracker.failCount,
		}
	}

	sortedDurations := make([]time.Duration, len(tracker.durations))
	copy(sortedDurations, tracker.durations)
	sort.Slice(sortedDurations, func(i, j int) bool {
		return sortedDurations[i] < sortedDurations[j]
	})

	calculatePercentile := func(p float64) time.Duration {
		index := int(float64(len(sortedDurations)) * p)
		if index >= len(sortedDurations) {
			index = len(sortedDurations) - 1
		}
		return sortedDurations[index]
	}

	return LatencySummary{
		TotalRequests: totalRequests,
		SuccessCount:  tracker.successCount,
		FailCount:     tracker.failCount,
		Min:           tracker.minLatency,
		Max:           tracker.maxLatency,
		Average:       tracker.totalLatency / time.Duration(tracker.successCount),
		P50:           calculatePercentile(0.50),
		P90:           calculatePercentile(0.90),
		P95:           calculatePercentile(0.95),
		P99:           calculatePercentile(0.99),
	}
}

type JudgedSubmissionResult struct {
	Username     string        `json:"username"`
	SubmissionID string        `json:"submissionId"`
	Status       string        `json:"status"`
	Verdict      string        `json:"verdict"`
	Score        int           `json:"score"`
	Duration     time.Duration `json:"duration"`
	Error        error         `json:"error,omitempty"`
}

type TestExecutionReport struct {
	Title             string            `json:"title"`
	Timestamp         string            `json:"timestamp"`
	TargetURL         string            `json:"targetUrl"`
	ScenarioName      string            `json:"scenarioName"`
	ProfileName       string            `json:"profileName"`
	TotalUsers        int               `json:"totalUsers"`
	ConcurrencyLimit  int               `json:"concurrencyLimit"`
	ElapsedDuration   time.Duration     `json:"elapsedDuration"`
	ThroughputRPS     float64           `json:"throughputRps"`
	LatencyMetrics    LatencySummary    `json:"latencyMetrics"`
	VerdictBreakdown  map[string]int    `json:"verdictBreakdown,omitempty"`
	APIProbeMetrics   *LatencySummary   `json:"apiProbeMetrics,omitempty"`
	AdditionalDetails map[string]string `json:"additionalDetails,omitempty"`
}
