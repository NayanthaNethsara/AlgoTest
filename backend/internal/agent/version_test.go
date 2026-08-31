package agent

import (
	"testing"
)

func TestIsVersionAllowed(t *testing.T) {
	tests := []struct {
		name          string
		clientVersion string
		minVersion    string
		want          bool
	}{
		{
			name:          "empty min version allows everything",
			clientVersion: "0.1.0",
			minVersion:    "",
			want:          true,
		},
		{
			name:          "exact matching version is allowed",
			clientVersion: "0.2.0",
			minVersion:    "0.2.0",
			want:          true,
		},
		{
			name:          "newer minor version is allowed",
			clientVersion: "0.3.0",
			minVersion:    "0.2.0",
			want:          true,
		},
		{
			name:          "newer patch version is allowed",
			clientVersion: "0.2.1",
			minVersion:    "0.2.0",
			want:          true,
		},
		{
			name:          "newer major version is allowed",
			clientVersion: "1.0.0",
			minVersion:    "0.2.0",
			want:          true,
		},
		{
			name:          "older version is rejected",
			clientVersion: "0.1.0",
			minVersion:    "0.2.0",
			want:          false,
		},
		{
			name:          "older patch is rejected",
			clientVersion: "0.2.0",
			minVersion:    "0.2.1",
			want:          false,
		},
		{
			name:          "handles v prefix gracefully",
			clientVersion: "v0.2.0",
			minVersion:    "0.2.0",
			want:          true,
		},
		{
			name:          "handles v prefix on min version",
			clientVersion: "0.2.0",
			minVersion:    "v0.2.0",
			want:          true,
		},
		{
			name:          "handles prerelease suffix",
			clientVersion: "0.2.0-beta.1",
			minVersion:    "0.2.0",
			want:          true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsVersionAllowed(tt.clientVersion, tt.minVersion)
			if got != tt.want {
				t.Errorf("IsVersionAllowed(%q, %q) = %v; want %v", tt.clientVersion, tt.minVersion, got, tt.want)
			}
		})
	}
}
