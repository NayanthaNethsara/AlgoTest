package problem

import (
	"errors"
	"fmt"
	"regexp"
	"time"
)

var (
	ErrInvalidSlug = errors.New("slug must be lowercase alphanumeric and hyphens only (e.g. 'two-sum')")
	slugRegex      = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
)

func ValidateSlug(slug string) error {
	if !slugRegex.MatchString(slug) {
		return ErrInvalidSlug
	}
	return nil
}

func ClampLimits(timeLimitMs, memoryLimitMb, maxScore int32) (int32, int32, int32) {
	if timeLimitMs <= 0 {
		timeLimitMs = 4000
	} else if timeLimitMs < 100 {
		timeLimitMs = 100
	} else if timeLimitMs > 10000 {
		timeLimitMs = 10000
	}

	if memoryLimitMb <= 0 {
		memoryLimitMb = 256
	} else if memoryLimitMb < 16 {
		memoryLimitMb = 16
	} else if memoryLimitMb > 1024 {
		memoryLimitMb = 1024
	}

	if maxScore <= 0 {
		maxScore = 100
	}

	return timeLimitMs, memoryLimitMb, maxScore
}

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

type Sample struct {
	ID          string `json:"id"`
	ProblemID   string `json:"problemId"`
	Ordinal     int32  `json:"ordinal"`
	Input       string `json:"input"`
	Output      string `json:"output"`
	Explanation string `json:"explanation,omitempty"`
}

type TestMetadata struct {
	ID          string `json:"id"`
	ProblemID   string `json:"problemId"`
	Ordinal     int32  `json:"ordinal"`
	InputSHA    string `json:"inputSha"`
	ExpectedSHA string `json:"expectedSha"`
	Points      int32  `json:"points"`
}

type ProblemDetail struct {
	Problem
	Samples []Sample       `json:"samples"`
	Tests   []TestMetadata `json:"tests,omitempty"`
}

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

type SampleInput struct {
	Ordinal     int32  `json:"ordinal"`
	Input       string `json:"input"`
	Output      string `json:"output"`
	Explanation string `json:"explanation"`
}

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
