package judge

type Status string

const (
	StatusQueued  Status = "queued"
	StatusRunning Status = "running"
	StatusPassed  Status = "passed"
	StatusFailed  Status = "failed"
)

type Submission struct {
	ID       string `json:"id"`
	Language string `json:"language"`
	Code     string `json:"code"`
}

type Result struct {
	SubmissionID string `json:"submission_id"`
	Status       Status `json:"status"`
	Output       string `json:"output"`
}
