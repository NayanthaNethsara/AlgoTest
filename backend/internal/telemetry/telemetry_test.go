package telemetry

import (
	"testing"
	"time"
)

func TestCalculateStatus(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name       string
		lastPingAt time.Time
		expected   Status
	}{
		{
			name:       "recent ping within 45s is online",
			lastPingAt: now.Add(-10 * time.Second),
			expected:   StatusOnline,
		},
		{
			name:       "exact 45s boundary is online",
			lastPingAt: now.Add(-45 * time.Second),
			expected:   StatusOnline,
		},
		{
			name:       "ping at 60s is stale",
			lastPingAt: now.Add(-60 * time.Second),
			expected:   StatusStale,
		},
		{
			name:       "exact 2 minute boundary is stale",
			lastPingAt: now.Add(-2 * time.Minute),
			expected:   StatusStale,
		},
		{
			name:       "ping past 2 minutes is offline",
			lastPingAt: now.Add(-3 * time.Minute),
			expected:   StatusOffline,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalculateStatus(tt.lastPingAt, now)
			if got != tt.expected {
				t.Errorf("CalculateStatus() = %v, want %v", got, tt.expected)
			}
		})
	}
}
