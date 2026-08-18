package api

import (
	"testing"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
)

func TestValidateTestsAgainstSamples(t *testing.T) {
	samples := []problem.SampleInput{
		{
			Ordinal: 1,
			Input:   "5\n1 2 3 4 5",
			Output:  "15",
		},
	}

	// Identical test case should fail
	duplicateTests := []testCaseDTO{
		{
			Ordinal:  1,
			Input:    "5\n1 2 3 4 5",
			Expected: "15",
			Points:   10,
		},
	}
	if err := validateTestsAgainstSamples(samples, duplicateTests); err == nil {
		t.Fatal("expected error when evaluation test matches public sample, got nil")
	}

	// Distinct test case should pass
	distinctTests := []testCaseDTO{
		{
			Ordinal:  1,
			Input:    "3\n10 20 30",
			Expected: "60",
			Points:   10,
		},
	}
	if err := validateTestsAgainstSamples(samples, distinctTests); err != nil {
		t.Fatalf("expected nil error for distinct test case, got %v", err)
	}
}

func TestMinEvaluationTestCasesConstant(t *testing.T) {
	if minEvaluationTestCases != 5 {
		t.Fatalf("expected minEvaluationTestCases to be 5, got %d", minEvaluationTestCases)
	}
}
