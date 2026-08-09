package agent

import (
	"testing"
	"time"
)

func TestDecide(t *testing.T) {
	now := time.Now()
	fresh := now.Add(-30 * time.Second)
	stale := now.Add(-120 * time.Second)
	stoppedAt := now.Add(-100 * time.Second)

	tests := []struct {
		name         string
		in           GateInput
		wantAllowed  bool
		wantCode     string
		wantClient   ActiveClient
		wantFindings []string
	}{
		{
			name:         "desktop shell with fresh attested agent passes clean",
			in:           GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: true, AttestOK: true},
			wantAllowed:  true,
			wantClient:   ClientDesktopShell,
			wantFindings: nil,
		},
		{
			name:         "browser fallback with a live agent is allowed and flagged",
			in:           GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: false, AttestOK: true},
			wantAllowed:  true,
			wantClient:   ClientBrowser,
			wantFindings: []string{"tel.web_client"},
		},
		{
			name:         "unattested submission is allowed by default but recorded",
			in:           GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: true, AttestOK: false},
			wantAllowed:  true,
			wantClient:   ClientDesktopShell,
			wantFindings: []string{"tel.no_attest"},
		},
		{
			name:         "unattested submission is blocked once organizers require it",
			in:           GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: true, AttestOK: false, RequireAttest: true},
			wantAllowed:  false,
			wantCode:     CodeNotAttested,
			wantClient:   ClientDesktopShell,
			wantFindings: []string{"tel.no_attest"},
		},
		{
			name:         "stale agent locks submissions",
			in:           GateInput{HasAgent: true, LastSeenAt: &stale, ShellAlive: true, AttestOK: true},
			wantAllowed:  false,
			wantCode:     CodeAgentStale,
			wantClient:   ClientDesktopShell,
			wantFindings: []string{"tel.no_agent_submit"},
		},
		{
			name:         "a deliberate stop is reported as stopped, not stale",
			in:           GateInput{HasAgent: true, LastSeenAt: &stale, StoppedAt: &stoppedAt, AttestOK: true},
			wantAllowed:  false,
			wantCode:     CodeAgentStopped,
			wantClient:   ClientBrowser,
			wantFindings: []string{"tel.no_agent_submit"},
		},
		{
			name:         "never-enrolled contestant is locked",
			in:           GateInput{HasAgent: false},
			wantAllowed:  false,
			wantCode:     CodeAgentMissing,
			wantClient:   ClientBrowser,
			wantFindings: []string{"tel.no_agent_submit"},
		},
		{
			name:         "enrolled but never reported is locked",
			in:           GateInput{HasAgent: true, LastSeenAt: nil},
			wantAllowed:  false,
			wantCode:     CodeAgentMissing,
			wantClient:   ClientBrowser,
			wantFindings: []string{"tel.no_agent_submit"},
		},
		{
			name:         "a fleet-wide outage must not lock anyone out",
			in:           GateInput{HasAgent: true, LastSeenAt: &stale, ShellAlive: true, AttestOK: true, IncidentOpen: true},
			wantAllowed:  true,
			wantClient:   ClientDesktopShell,
			wantFindings: nil,
		},
		{
			name:         "exemption allows the submission and leaves a standing record",
			in:           GateInput{Exempt: true, ExemptReason: "broken install, seat 42"},
			wantAllowed:  true,
			wantClient:   ClientBrowser,
			wantFindings: []string{"tel.exempt"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Decide(tt.in, now)

			if got.Allowed != tt.wantAllowed {
				t.Errorf("Allowed = %v, want %v", got.Allowed, tt.wantAllowed)
			}
			if got.Code != tt.wantCode {
				t.Errorf("Code = %q, want %q", got.Code, tt.wantCode)
			}
			if got.ActiveClient != tt.wantClient {
				t.Errorf("ActiveClient = %q, want %q", got.ActiveClient, tt.wantClient)
			}
			if len(got.findings) != len(tt.wantFindings) {
				t.Fatalf("findings = %v, want %v", ruleIDs(got.findings), tt.wantFindings)
			}
			for i, want := range tt.wantFindings {
				if got.findings[i].RuleID != want {
					t.Errorf("findings[%d] = %q, want %q", i, got.findings[i].RuleID, want)
				}
			}
			if !got.Allowed && got.Remedy == "" {
				t.Error("a blocked submission must tell the contestant how to recover")
			}
		})
	}
}

func TestClassify(t *testing.T) {
	now := time.Now()
	boot := "11111111-1111-1111-1111-111111111111"
	other := "22222222-2222-2222-2222-222222222222"
	stopped := now.Add(-time.Minute)
	offset := int64(0)

	t.Run("sequence regression within one boot is a replay", func(t *testing.T) {
		got := Classify(Agent{BootID: &boot, Seq: 50}, Heartbeat{BootID: boot, Seq: 40}, now)
		if !got.SeqReplay {
			t.Error("want SeqReplay")
		}
	})

	t.Run("a new boot without a clean stop is a crash", func(t *testing.T) {
		got := Classify(Agent{BootID: &boot, Seq: 50}, Heartbeat{BootID: other, Seq: 1}, now)
		if !got.NewBoot || got.CleanRestart {
			t.Errorf("want crash restart, got %+v", got)
		}
	})

	t.Run("a new boot after a clean stop is not a crash", func(t *testing.T) {
		got := Classify(Agent{BootID: &boot, Seq: 50, StoppedAt: &stopped}, Heartbeat{BootID: other, Seq: 1}, now)
		if !got.CleanRestart {
			t.Error("want CleanRestart")
		}
	})

	t.Run("a steadily wrong clock is not tampering", func(t *testing.T) {
		skewed := int64(3_600_000)
		got := Classify(
			Agent{BootID: &boot, Seq: 1, ClockOffsetMs: &skewed},
			Heartbeat{BootID: boot, Seq: 2, WallTS: now.Add(time.Hour)},
			now,
		)
		if got.ClockSkewMs != 0 {
			t.Errorf("ClockSkewMs = %d, want 0 for a constant offset", got.ClockSkewMs)
		}
	})

	t.Run("a clock jump mid-contest is tampering", func(t *testing.T) {
		got := Classify(
			Agent{BootID: &boot, Seq: 1, ClockOffsetMs: &offset},
			Heartbeat{BootID: boot, Seq: 2, WallTS: now.Add(10 * time.Minute)},
			now,
		)
		if got.ClockSkewMs == 0 {
			t.Error("want a non-zero ClockSkewMs")
		}
	})

	t.Run("a buffered replay is exempt from the clock check", func(t *testing.T) {
		got := Classify(
			Agent{BootID: &boot, Seq: 1, ClockOffsetMs: &offset},
			Heartbeat{BootID: boot, Seq: 2, WallTS: now.Add(-30 * time.Minute), Buffered: true},
			now,
		)
		if got.ClockSkewMs != 0 {
			t.Errorf("ClockSkewMs = %d, want 0 for a buffered heartbeat", got.ClockSkewMs)
		}
	})
}

func ruleIDs(fs []finding) []string {
	out := make([]string, 0, len(fs))
	for _, f := range fs {
		out = append(out, f.RuleID)
	}
	return out
}
