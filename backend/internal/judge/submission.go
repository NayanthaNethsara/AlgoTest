package judge

import "time"

type Status string

const (
	StatusQueued  Status = "queued"
	StatusRunning Status = "running"
	StatusPassed  Status = "passed"
	StatusFailed  Status = "failed"
)

type Submission struct {
	ID            string     `json:"id"`
	TeamID        string     `json:"team_id"`
	UserID        string     `json:"user_id"`
	ProblemID     string     `json:"problem_id"`
	Language      string     `json:"language"`
	Code          string     `json:"code"`
	State         Status     `json:"state"`
	Verdict       *string    `json:"verdict,omitempty"`
	Score         int        `json:"score"`
	MaxScore      int        `json:"max_score"`
	TestsTotal    int        `json:"tests_total"`
	TestsDone     int        `json:"tests_done"`
	CompileError  *string    `json:"compile_error,omitempty"`
	MaxTimeMS     int        `json:"max_time_ms"`
	MaxMemoryKB    int        `json:"max_memory_kb"`
	QueuePosition int        `json:"queue_position,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	FinishedAt    *time.Time `json:"finished_at,omitempty"`
}

type SubmissionTest struct {
	SubmissionID string `json:"submission_id"`
	Ordinal      int    `json:"ordinal"`
	Verdict      string `json:"verdict"`
	TimeMS       int    `json:"time_ms"`
	MemoryKB     int    `json:"memory_kb"`
	Points       int    `json:"points"`
}

type Result struct {
	SubmissionID  string           `json:"submission_id"`
	UserID        string           `json:"user_id"`
	TeamID        string           `json:"team_id"`
	ProblemID     string           `json:"problem_id"`
	Status        Status           `json:"status"`
	Verdict       *string          `json:"verdict,omitempty"`
	Score         int              `json:"score"`
	MaxScore      int              `json:"max_score"`
	TestsTotal    int              `json:"tests_total"`
	TestsDone     int              `json:"tests_done"`
	CompileError  *string          `json:"compile_error,omitempty"`
	QueuePosition int              `json:"queue_position,omitempty"`
	Tests         []SubmissionTest `json:"tests,omitempty"`
	CreatedAt     time.Time        `json:"created_at"`
	FinishedAt    *time.Time       `json:"finished_at,omitempty"`
}
