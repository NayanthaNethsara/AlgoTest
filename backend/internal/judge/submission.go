package judge

import (
	"errors"
	"time"
)

var (
	ErrActiveSubmissionExists = errors.New("active submission already in progress for this problem")
	ErrProblemNotFound        = errors.New("problem not found")
	ErrNoQueuedSubmission     = errors.New("no queued submission available")
	ErrLeaseLost              = errors.New("lease no longer held by this worker")
	ErrNoTestCases            = errors.New("problem has no test cases configured")
	ErrSubmissionNotFound     = errors.New("submission not found")
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
	ID            string  `json:"id"`
	TeamID        string  `json:"teamId"`
	UserID        string  `json:"userId"`
	ProblemID     string  `json:"problemId"`
	Language      string  `json:"language"`
	Code          string  `json:"code"`
	State         Status  `json:"state"`
	Verdict       *string `json:"verdict,omitempty"`
	Score         int     `json:"score"`
	MaxScore      int     `json:"maxScore"`
	TestsTotal    int     `json:"testsTotal"`
	TestsDone     int     `json:"testsDone"`
	CompileError  *string `json:"compileError,omitempty"`
	MaxTimeMS     int     `json:"maxTimeMs"`
	MaxMemoryKB   int     `json:"maxMemoryKb"`
	QueuePosition int     `json:"queuePosition,omitempty"`
	// Limits copied from the problem at claim time, so judging uses the
	// problem's own budget instead of the server-wide default.
	TimeLimitMS   int        `json:"timeLimitMs,omitempty"`
	MemoryLimitMB int        `json:"memoryLimitMb,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	FinishedAt    *time.Time `json:"finishedAt,omitempty"`
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
}

type Result struct {
	SubmissionID  string           `json:"submissionId"`
	UserID        string           `json:"userId"`
	TeamID        string           `json:"teamId"`
	ProblemID     string           `json:"problemId"`
	Status        Status           `json:"status"`
	Verdict       *string          `json:"verdict,omitempty"`
	Score         int              `json:"score"`
	MaxScore      int              `json:"maxScore"`
	TestsTotal    int              `json:"testsTotal"`
	TestsDone     int              `json:"testsDone"`
	CompileError  *string          `json:"compileError,omitempty"`
	QueuePosition int              `json:"queuePosition,omitempty"`
	Tests         []SubmissionTest `json:"tests,omitempty"`
	CreatedAt     time.Time        `json:"createdAt"`
	FinishedAt    *time.Time       `json:"finishedAt,omitempty"`
	ReviewStatus  ReviewStatus     `json:"reviewStatus,omitempty"`
	ReviewReason  string           `json:"reviewReason,omitempty"`
	ReviewedAt    *time.Time       `json:"reviewedAt,omitempty"`
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
