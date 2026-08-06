package proctor

import (
	"testing"
	"time"
)

func TestGateCheckLogic(t *testing.T) {
	now := time.Now()
	recentPing := now.Add(-30 * time.Second)
	stalePing := now.Add(-120 * time.Second)

	tests := []struct {
		name          string
		isExempt      bool
		lastPing      *time.Time
		wantAllowed   bool
		wantExempt    bool
	}{
		{
			name:        "Exempt user is allowed",
			isExempt:    true,
			lastPing:    nil,
			wantAllowed: true,
			wantExempt:  true,
		},
		{
			name:        "User with recent ping is allowed",
			isExempt:    false,
			lastPing:    &recentPing,
			wantAllowed: true,
			wantExempt:  false,
		},
		{
			name:        "User with stale ping is locked",
			isExempt:    false,
			lastPing:    &stalePing,
			wantAllowed: false,
			wantExempt:  false,
		},
		{
			name:        "User with no ping is locked",
			isExempt:    false,
			lastPing:    nil,
			wantAllowed: false,
			wantExempt:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status := evaluateGateStatus(tt.isExempt, tt.lastPing, now)
			if status.Allowed != tt.wantAllowed {
				t.Errorf("Allowed = %v, want %v", status.Allowed, tt.wantAllowed)
			}
			if status.Exempt != tt.wantExempt {
				t.Errorf("Exempt = %v, want %v", status.Exempt, tt.wantExempt)
			}
		})
	}
}

func evaluateGateStatus(isExempt bool, lastPing *time.Time, now time.Time) GateStatus {
	if isExempt {
		return GateStatus{Allowed: true, Exempt: true}
	}
	if lastPing == nil {
		return GateStatus{Allowed: false, Exempt: false, SecondsSincePing: 999999}
	}
	elapsed := int(now.Sub(*lastPing).Seconds())
	if elapsed > ProctorGateMaxStaleSeconds {
		return GateStatus{Allowed: false, Exempt: false, LastPingAt: lastPing, SecondsSincePing: elapsed}
	}
	return GateStatus{Allowed: true, Exempt: false, LastPingAt: lastPing, SecondsSincePing: elapsed}
}
