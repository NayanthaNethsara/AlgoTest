package problem

import "testing"

func TestDistributePointsMatchesMaxScore(t *testing.T) {
	cases := []struct {
		name     string
		count    int
		maxScore int32
		want     []int32
	}{
		{"even split", 4, 100, []int32{25, 25, 25, 25}},
		{"remainder goes to the earliest tests", 3, 100, []int32{34, 33, 33}},
		{"single test takes it all", 1, 100, []int32{100}},
		{"more tests than points", 4, 3, []int32{1, 1, 1, 0}},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			tests := make([]TestInput, c.count)
			DistributePoints(tests, c.maxScore)

			var total int32
			for i, test := range tests {
				if test.Points != c.want[i] {
					t.Errorf("test %d points = %d, want %d", i, test.Points, c.want[i])
				}
				total += test.Points
			}
			if total != c.maxScore {
				t.Errorf("total = %d, want %d", total, c.maxScore)
			}
		})
	}
}

func TestDistributePointsLeavesExplicitWeightsAlone(t *testing.T) {
	tests := []TestInput{{Points: 10}, {Points: 90}}
	DistributePoints(tests, 100)

	if tests[0].Points != 10 || tests[1].Points != 90 {
		t.Errorf("author-set subtask weights were overwritten: %+v", tests)
	}
}

func TestDistributePointsIgnoresMissingMaxScore(t *testing.T) {
	tests := make([]TestInput, 2)
	DistributePoints(tests, 0)

	for i, test := range tests {
		if test.Points != 0 {
			t.Errorf("test %d points = %d, want 0 so the repository default applies", i, test.Points)
		}
	}
}
