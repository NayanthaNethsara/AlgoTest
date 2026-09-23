package agent

import "testing"

func TestCompareSemver(t *testing.T) {
	tests := []struct {
		v1   string
		v2   string
		want int
	}{
		{"0.2.0", "0.2.0", 0},
		{"v0.2.0", "0.2.0", 0},
		{"0.2.0", "v0.2.0", 0},
		{"0.2.1", "0.2.0", 1},
		{"0.1.9", "0.2.0", -1},
		{"0.10.0", "0.2.0", 1},
		{"1.0.0", "0.9.9", 1},
		{"0.2.0-beta", "0.2.0", 0},
		{"0.0.1", "0.0.2", -1},
		{"", "0.1.0", -1},
		{"0.1.0", "", 1},
	}

	for _, tt := range tests {
		got := CompareSemver(tt.v1, tt.v2)
		if got != tt.want {
			t.Errorf("CompareSemver(%q, %q) = %d, want %d", tt.v1, tt.v2, got, tt.want)
		}
	}
}
