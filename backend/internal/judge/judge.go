package judge

import (
	"bytes"
	"errors"
	"strings"
	"time"
)

func outputsEqual(actual string, expected []byte) bool {
	actual = strings.TrimSpace(actual)
	expected = bytes.TrimSpace(expected)
	for len(actual) > 0 || len(expected) > 0 {
		var a string
		var e []byte
		a, actual = outputLine(actual)
		e, expected = outputLine(expected)
		if len(a) != len(e) {
			return false
		}
		for i := 0; i < len(a); i++ {
			if a[i] != e[i] {
				return false
			}
		}
	}
	return true
}

func outputLine[T ~string | ~[]byte](text T) (T, T) {
	end := 0
	for end < len(text) && text[end] != '\r' && text[end] != '\n' {
		end++
	}
	next := end
	if next < len(text) {
		next++
		if text[end] == '\r' && next < len(text) && text[next] == '\n' {
			next++
		}
	}
	for end > 0 && (text[end-1] == ' ' || text[end-1] == '\t') {
		end--
	}
	return text[:end], text[next:]
}

var (
	ErrActiveSubmissionExists = errors.New("active submission already in progress for this problem")
	ErrProblemNotFound        = errors.New("problem not found")
	ErrNoQueuedSubmission     = errors.New("no queued submission available")
	ErrLeaseLost              = errors.New("lease no longer held by this worker")
	ErrNoTestCases            = errors.New("problem has no test cases configured")
	ErrSubmissionNotFound     = errors.New("submission not found")
	ErrSubmissionNotActive    = errors.New("submission is not queued or running")
	ErrSubmissionRateLimited  = errors.New("submission cooldown active, please wait a few seconds before submitting again")
)

type Status string

const (
	StatusQueued  Status = "queued"
	StatusRunning Status = "running"
	StatusPassed  Status = "passed"
	StatusFailed  Status = "failed"
)

type ReviewStatus string

const (
	ReviewAccepted ReviewStatus = "accepted"
	ReviewRejected ReviewStatus = "rejected"
)

func ValidReviewStatus(s string) bool {
	return ReviewStatus(s) == ReviewAccepted || ReviewStatus(s) == ReviewRejected
}

type Submission struct {
	ID               string     `json:"id"`
	TeamID           string     `json:"teamId"`
	UserID           string     `json:"userId"`
	ProblemID        string     `json:"problemId"`
	Language         string     `json:"language"`
	Code             string     `json:"code"`
	State            Status     `json:"state"`
	Verdict          *string    `json:"verdict,omitempty"`
	Score            int        `json:"score"`
	MaxScore         int        `json:"maxScore"`
	TestsTotal       int        `json:"testsTotal"`
	TestsDone        int        `json:"testsDone"`
	CompileError     *string    `json:"compileError,omitempty"`
	MaxTimeMS        int        `json:"maxTimeMs"`
	MaxMemoryKB      int        `json:"maxMemoryKb"`
	QueuePosition    int        `json:"queuePosition,omitempty"`
	TimeLimitMS      int        `json:"timeLimitMs,omitempty"`
	MemoryLimitMB    int        `json:"memoryLimitMb,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
	FinishedAt       *time.Time `json:"finishedAt,omitempty"`
	AttemptStartedAt *time.Time `json:"attemptStartedAt,omitempty"`
}

type TestCase struct {
	ID       string `json:"id"`
	Ordinal  int    `json:"ordinal"`
	Input    []byte `json:"input"`
	Expected []byte `json:"expected"`
	Points   int    `json:"points"`
}

type SubmissionTest struct {
	SubmissionID string `json:"submissionId"`
	Ordinal      int    `json:"ordinal"`
	Verdict      string `json:"verdict"`
	TimeMS       int    `json:"timeMs"`
	MemoryKB     int    `json:"memoryKb"`
	Points       int    `json:"points"`
	MaxPoints    int    `json:"maxPoints"`
}

type Result struct {
	SubmissionID     string           `json:"submissionId"`
	UserID           string           `json:"userId"`
	TeamID           string           `json:"teamId"`
	ProblemID        string           `json:"problemId"`
	Status           Status           `json:"status"`
	Verdict          *string          `json:"verdict,omitempty"`
	Score            int              `json:"score"`
	MaxScore         int              `json:"maxScore"`
	TestsTotal       int              `json:"testsTotal"`
	TestsDone        int              `json:"testsDone"`
	CompileError     *string          `json:"compileError,omitempty"`
	QueuePosition    int              `json:"queuePosition,omitempty"`
	Tests            []SubmissionTest `json:"tests,omitempty"`
	CreatedAt        time.Time        `json:"createdAt"`
	FinishedAt       *time.Time       `json:"finishedAt,omitempty"`
	ReviewStatus     ReviewStatus     `json:"reviewStatus,omitempty"`
	ReviewReason     string           `json:"reviewReason,omitempty"`
	ReviewedAt       *time.Time       `json:"reviewedAt,omitempty"`
	AttemptStartedAt *time.Time       `json:"attemptStartedAt,omitempty"`
}

type AdminSubmissionItem struct {
	Result
	UserName     string `json:"userName"`
	UserEmail    string `json:"userEmail"`
	TeamName     string `json:"teamName"`
	ProblemTitle string `json:"problemTitle"`
	Language     string `json:"language"`
	Code         string `json:"code"`
	ReviewedBy   string `json:"reviewedBy,omitempty"`
}

type ProblemProgress struct {
	ProblemID string `json:"problemId"`
	BestScore int    `json:"bestScore"`
	Status    string `json:"status"`
}

type SubmissionCounts struct {
	Queued   int `json:"queued"`
	Running  int `json:"running"`
	Passed   int `json:"passed"`
	Failed   int `json:"failed"`
	Rejected int `json:"rejected"`
}
