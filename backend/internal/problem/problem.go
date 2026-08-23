package problem

import (
	"errors"
	"fmt"
	"time"
)

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

var ErrPointsMismatch = errors.New("test points do not sum to the problem's max score")

func ValidateTestPoints(tests []TestInput, maxScore int32) error {
	if len(tests) == 0 {
		return nil
	}

	var sum int32
	custom := false
	for _, t := range tests {
		if t.Points != 0 {
			custom = true
		}
		sum += t.Points
	}
	if !custom {
		return nil
	}

	for _, t := range tests {
		if t.Points <= 0 {
			return fmt.Errorf("%w: test %d carries %d points -- once any test is weighted by hand every test needs a positive value, or leave them all at 0 to split %d evenly",
				ErrPointsMismatch, t.Ordinal, t.Points, maxScore)
		}
	}

	if sum != maxScore {
		return fmt.Errorf("%w: the test cases total %d points but the problem is worth %d -- give every test a value that adds up to %d, or leave them all at 0 to split it evenly",
			ErrPointsMismatch, sum, maxScore, maxScore)
	}
	return nil
}

// DistributePoints shares maxScore across tests that carry no points of their
// own. The judge scores the sum of passed tests, so leaving them at 1 each
// would make the problem worth len(tests) rather than its advertised maxScore.
func DistributePoints(tests []TestInput, maxScore int32) {
	if len(tests) == 0 || maxScore <= 0 {
		return
	}
	for _, t := range tests {
		if t.Points > 0 {
			return
		}
	}

	base := maxScore / int32(len(tests))
	remainder := int(maxScore % int32(len(tests)))
	for i := range tests {
		tests[i].Points = base
		if i < remainder {
			tests[i].Points++
		}
	}
}
