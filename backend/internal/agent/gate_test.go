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

	// The desktop path, spelled out once: a live agent, its shell process reporting
	// alive, and a client that says it is that shell.
	desktop := GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: true, ClaimsDesktop: true, AttestOK: true}

	tests := []struct {
		name         string
		in           GateInput
		wantAllowed  bool
		wantCode     string
		wantClient   ActiveClient
		wantMode     AccessMode
		wantFindings []string
	}{
		{
			name:         "desktop shell with fresh attested agent passes clean",
			in:           desktop,
			wantAllowed:  true,
			wantClient:   ClientDesktopShell,
			wantMode:     ModeDesktopShell,
			wantFindings: nil,
		},
		{
			name:         "browser fallback with a live agent is allowed by default",
			in:           GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: false, AttestOK: true},
			wantAllowed:  true,
			wantCode:     "",
			wantClient:   ClientBrowser,
			wantMode:     ModeWebWithAgent,
			wantFindings: []string{"tel.web_client"},
		},
		{
			name: "browser fallback is allowed and flagged",
			in: GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: false, AttestOK: true,
				AccessReason: "contestant using standard browser with proctor agent"},
			wantAllowed:  true,
			wantClient:   ClientBrowser,
			wantMode:     ModeWebWithAgent,
			wantFindings: []string{"tel.web_client"},
		},
		{
			name: "no agent at all is allowed once web_only mode is granted",
			in: GateInput{HasAgent: false, Grant: AccessGrant{WebOnly: true},
				AccessReason: "seat 12, desktop client will not install"},
			wantAllowed:  true,
			wantClient:   ClientBrowser,
			wantMode:     ModeWebOnly,
			wantFindings: []string{"tel.web_only_grant"},
		},
		{
			name: "browser without agent is refused when web_only is not granted",
			in: GateInput{HasAgent: false,
				AccessReason: "no running agent"},
			wantAllowed:  false,
			wantCode:     CodeAgentMissing,
			wantClient:   ClientBrowser,
			wantMode:     ModeWebOnly,
			wantFindings: []string{"tel.no_agent_submit"},
		},
		{
			name: "a desktop claim the agent does not corroborate is treated as a browser and allowed",
			in: GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: false, ClaimsDesktop: true,
				AttestOK: true},
			wantAllowed:  true,
			wantCode:     "",
			wantClient:   ClientBrowser,
			wantMode:     ModeWebWithAgent,
			wantFindings: []string{"tel.web_client"},
		},
		{
			name: "a live shell the contestant is not using is treated as a browser and allowed",
			in: GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: true, ClaimsDesktop: false,
				AttestOK: true},
			wantAllowed:  true,
			wantCode:     "",
			wantClient:   ClientBrowser,
			wantMode:     ModeWebWithAgent,
			wantFindings: []string{"tel.web_client"},
		},
		{
			name:         "unattested submission is allowed by default but recorded",
			in:           GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: true, ClaimsDesktop: true, AttestOK: false},
			wantAllowed:  true,
			wantClient:   ClientDesktopShell,
			wantMode:     ModeDesktopShell,
			wantFindings: []string{"tel.no_attest"},
		},
		{
			name: "unattested submission is blocked once organizers require it",
			in: GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: true, ClaimsDesktop: true,
				AttestOK: false, RequireAttest: true},
			wantAllowed:  false,
			wantCode:     CodeNotAttested,
			wantClient:   ClientDesktopShell,
			wantMode:     ModeDesktopShell,
			wantFindings: []string{"tel.no_attest"},
		},
		{
			name:         "stale agent locks submissions",
			in:           GateInput{HasAgent: true, LastSeenAt: &stale, ShellAlive: true, ClaimsDesktop: true, AttestOK: true},
			wantAllowed:  false,
			wantCode:     CodeAgentStale,
			wantClient:   ClientBrowser,
			wantMode:     ModeWebOnly,
			wantFindings: []string{"tel.no_agent_submit"},
		},
		{
			name:         "a deliberate stop is reported as stopped, not stale",
			in:           GateInput{HasAgent: true, LastSeenAt: &stale, StoppedAt: &stoppedAt, AttestOK: true},
			wantAllowed:  false,
			wantCode:     CodeAgentStopped,
			wantClient:   ClientBrowser,
			wantMode:     ModeWebOnly,
			wantFindings: []string{"tel.no_agent_submit"},
		},
		{
			name:         "never-enrolled contestant is locked",
			in:           GateInput{HasAgent: false},
			wantAllowed:  false,
			wantCode:     CodeAgentMissing,
			wantClient:   ClientBrowser,
			wantMode:     ModeWebOnly,
			wantFindings: []string{"tel.no_agent_submit"},
		},
		{
			name:         "enrolled but never reported is locked",
			in:           GateInput{HasAgent: true, LastSeenAt: nil},
			wantAllowed:  false,
			wantCode:     CodeAgentMissing,
			wantClient:   ClientBrowser,
			wantMode:     ModeWebOnly,
			wantFindings: []string{"tel.no_agent_submit"},
		},
		{
			name: "a fleet-wide outage must not lock anyone out",
			in: GateInput{HasAgent: true, LastSeenAt: &stale, ShellAlive: true, ClaimsDesktop: true,
				AttestOK: true, IncidentOpen: true},
			wantAllowed:  true,
			wantClient:   ClientBrowser,
			wantMode:     ModeWebOnly,
			wantFindings: nil,
		},
		{
			name:         "exemption allows the submission and leaves a standing record",
			in:           GateInput{Exempt: true, ExemptReason: "broken install, seat 42"},
			wantAllowed:  true,
			wantClient:   ClientBrowser,
			wantMode:     ModeWebOnly,
			wantFindings: []string{"tel.exempt"},
		},
		{
			// The flags are independent, so this really does refuse the browser while
			// permitting the same person to submit with no agent at all. Perverse, and
			// enforced exactly as configured — the console is where it gets questioned.
			name: "a web-only grant permits browser submissions with live agent as standard",
			in: GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: false, AttestOK: true,
				Grant: AccessGrant{WebOnly: true}, AccessReason: "machine cannot run the client"},
			wantAllowed:  true,
			wantCode:     "",
			wantClient:   ClientBrowser,
			wantMode:     ModeWebWithAgent,
			wantFindings: []string{"tel.web_client"},
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
			if got.AccessMode != tt.wantMode {
				t.Errorf("AccessMode = %q, want %q", got.AccessMode, tt.wantMode)
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

// The shell→agent→server chain drops a beat routinely: a resumed laptop or a
// stalled shell yields one heartbeat that says shell_alive=false. Reading that as
// "the contestant moved to a browser" would refuse someone sitting in front of the
// client, which is the worst thing this gate could do.
func TestDesktopClaimSurvivesOneMissedShellPing(t *testing.T) {
	now := time.Now()
	fresh := now.Add(-10 * time.Second)

	base := GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: false, ClaimsDesktop: true, AttestOK: true}

	t.Run("a recent sighting still corroborates the claim", func(t *testing.T) {
		seen := now.Add(-40 * time.Second)
		in := base
		in.ShellSeenAt = &seen

		got := Decide(in, now)
		if got.AccessMode != ModeDesktopShell {
			t.Errorf("AccessMode = %q, want %q for a shell seen 40s ago", got.AccessMode, ModeDesktopShell)
		}
		if !got.Allowed {
			t.Errorf("a desktop contestant was refused with code %q", got.Code)
		}
	})

	t.Run("a sighting past the grace window does not", func(t *testing.T) {
		seen := now.Add(-(ShellGraceSeconds + 10) * time.Second)
		in := base
		in.ShellSeenAt = &seen

		got := Decide(in, now)
		if got.AccessMode != ModeWebWithAgent {
			t.Errorf("AccessMode = %q, want %q once the shell is long gone", got.AccessMode, ModeWebWithAgent)
		}
	})

	t.Run("a claim with no sighting at all is never believed", func(t *testing.T) {
		if got := Decide(base, now); got.AccessMode != ModeWebWithAgent {
			t.Errorf("AccessMode = %q, want %q when the agent has never seen a shell",
				got.AccessMode, ModeWebWithAgent)
		}
	})

	// The grace window is leniency about *when* the shell was seen, never about
	// whether an agent is reporting at all.
	t.Run("grace never substitutes for a live agent", func(t *testing.T) {
		seen := now.Add(-5 * time.Second)
		in := GateInput{HasAgent: false, ClaimsDesktop: true, ShellSeenAt: &seen}

		got := Decide(in, now)
		if got.AccessMode != ModeWebOnly || got.Allowed {
			t.Errorf("AccessMode = %q, allowed = %v; want %q and refused",
				got.AccessMode, got.Allowed, ModeWebOnly)
		}
	})
}

// The attestation finding is read by a human deciding whether a contestant
// cheated, so it must never present the portal host as the contestant's address.
func TestUnattestedEvidenceOmitsUntrustedClientIP(t *testing.T) {
	now := time.Now()
	fresh := now.Add(-30 * time.Second)
	base := GateInput{HasAgent: true, LastSeenAt: &fresh, ShellAlive: true, ClaimsDesktop: true, AgentLanIP: "10.0.0.5"}

	t.Run("untrusted address is withheld rather than compared", func(t *testing.T) {
		in := base
		in.ClientIP = "172.18.0.4" // the Next server, not the contestant
		in.ClientIPTrusted = false

		got := Decide(in, now)
		evidence := findingEvidence(t, got, "tel.no_attest")

		if _, ok := evidence["ip_mismatch"]; ok {
			t.Error("ip_mismatch reported from an address the contestant never owned")
		}
		if _, ok := evidence["client_ip"]; ok {
			t.Error("client_ip recorded despite being a proxy hop")
		}
		if _, ok := evidence["client_ip_unknown"]; !ok {
			t.Error("a reviewer must be able to tell an unknown address from a matching one")
		}
	})

	t.Run("trusted address is compared", func(t *testing.T) {
		in := base
		in.ClientIP = "10.0.0.9"
		in.ClientIPTrusted = true

		evidence := findingEvidence(t, Decide(in, now), "tel.no_attest")
		if mismatch, ok := evidence["ip_mismatch"].(bool); !ok || !mismatch {
			t.Errorf("ip_mismatch = %v, want true for 10.0.0.9 against agent 10.0.0.5", evidence["ip_mismatch"])
		}
		if comparable, ok := evidence["ip_comparable"].(bool); !ok || !comparable {
			t.Error("two LAN addresses should be marked comparable")
		}
	})

	t.Run("a public portal address is not compared to a LAN address", func(t *testing.T) {
		in := base
		in.ClientIP = "203.0.113.7"
		in.ClientIPTrusted = true

		evidence := findingEvidence(t, Decide(in, now), "tel.no_attest")
		if _, ok := evidence["ip_mismatch"]; ok {
			t.Error("a public address must not be reported as mismatching a LAN address")
		}
		if comparable, ok := evidence["ip_comparable"].(bool); !ok || comparable {
			t.Error("a reviewer must be able to tell 'not comparable' from 'matched'")
		}
		if evidence["client_ip"] != "203.0.113.7" {
			t.Errorf("the address should still be recorded, got %v", evidence["client_ip"])
		}
	})
}

func TestPrivateIP(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want bool
	}{
		{"10.0.0.5", true},
		{"192.168.1.20", true},
		{"172.18.0.4", true},
		{"127.0.0.1", true},
		{"169.254.10.1", true},
		{"10.0.0.5:53312", true}, // a direct peer address carries a port
		{"203.0.113.7", false},
		{"8.8.8.8", false},
		{"", false},
		{"not-an-ip", false},
	} {
		if got := privateIP(tc.in); got != tc.want {
			t.Errorf("privateIP(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}

func findingEvidence(t *testing.T, d Decision, ruleID string) map[string]any {
	t.Helper()
	for _, f := range d.findings {
		if f.RuleID == ruleID {
			return f.Evidence
		}
	}
	t.Fatalf("no %q finding in %v", ruleID, ruleIDs(d.findings))
	return nil
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
