package problem

import "time"

// Problem represents a competitive programming problem.
type Problem struct {
	ID            string    `json:"id"`
	Slug          string    `json:"slug"`
	Title         string    `json:"title"`
	Difficulty    string    `json:"difficulty"`
	Statement     string    `json:"statement"`
	Constraints   string    `json:"constraints"`
	TimeLimitMs   int32     `json:"timeLimitMs"`
	MemoryLimitMb int32     `json:"memoryLimitMb"`
	MaxScore      int32     `json:"maxScore"`
	Published     bool      `json:"published"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// Sample represents a public sample test case shown with the problem statement.
type Sample struct {
	ID          string `json:"id"`
	ProblemID   string `json:"problemId"`
	Ordinal     int32  `json:"ordinal"`
	Input       string `json:"input"`
	Output      string `json:"output"`
	Explanation string `json:"explanation,omitempty"`
}

// TestMetadata contains non-sensitive metadata for a hidden test case.
type TestMetadata struct {
	ID          string `json:"id"`
	ProblemID   string `json:"problemId"`
	Ordinal     int32  `json:"ordinal"`
	InputSHA    string `json:"inputSha"`
	ExpectedSHA string `json:"expectedSha"`
	Points      int32  `json:"points"`
}

// ProblemDetail combines problem metadata with sample cases and optional test metadata.
type ProblemDetail struct {
	Problem
	Samples []Sample       `json:"samples"`
	Tests   []TestMetadata `json:"tests,omitempty"`
}

// CreateProblemInput defines the input parameters for creating or updating a problem.
type CreateProblemInput struct {
	Slug          string
	Title         string
	Difficulty    string
	Statement     string
	Constraints   string
	TimeLimitMs   int32
	MemoryLimitMb int32
	MaxScore      int32
	Published     bool
	Samples       []SampleInput
}

// SampleInput defines input data for a sample test case.
type SampleInput struct {
	Ordinal     int32  `json:"ordinal"`
	Input       string `json:"input"`
	Output      string `json:"output"`
	Explanation string `json:"explanation"`
}

// TestInput defines input data for a hidden grading test case.
type TestInput struct {
	Ordinal  int32  `json:"ordinal"`
	Input    []byte `json:"input"`
	Expected []byte `json:"expected"`
	Points   int32  `json:"points"`
}
