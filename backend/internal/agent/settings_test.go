package agent

import (
	"os"
	"regexp"
	"slices"
	"testing"
)

// The seeded policy and the compiled-in fallback are the same list written twice:
// once in SQL for a fresh install, once in Go for when a row is missing or
// unreadable. Nothing else stops them drifting, and drift here is invisible —
// detection would quietly differ depending on whether the database answered.
func TestMigrationSeedMatchesDefaultPolicy(t *testing.T) {
	raw, err := os.ReadFile("../db/migrations/0008_proctor_policy.sql")
	if err != nil {
		t.Fatalf("read policy migration: %v", err)
	}

	seed := map[string]string{}
	for _, m := range regexp.MustCompile(`\('(proctor\.[a-z_]+)',\s*\n?\s*'([^']*)'\)`).
		FindAllStringSubmatch(string(raw), -1) {
		seed[m[1]] = m[2]
	}

	// Guards against the regex silently matching nothing after a reformat, which
	// would otherwise make every assertion below pass against an empty map.
	if len(seed) != 8 {
		t.Fatalf("parsed %d policy keys from the migration, want 8: %v", len(seed), seed)
	}

	snapshot := buildSnapshot(seed, nil)
	if snapshot.degraded {
		t.Error("the seeded policy should parse completely; a fallback means the SQL is malformed")
	}
	if got, want := snapshot.policy, DefaultPolicy(); !policyEqual(got, want) {
		t.Errorf("seeded policy has drifted from DefaultPolicy\n seed: %+v\n  def: %+v", got, want)
	}
}

func policyEqual(a, b Policy) bool {
	return a.HeartbeatSeconds == b.HeartbeatSeconds &&
		a.PortProbeSeconds == b.PortProbeSeconds &&
		a.KeepaliveSeconds == b.KeepaliveSeconds &&
		a.RulesRefreshSeconds == b.RulesRefreshSeconds &&
		a.GateMaxStaleSeconds == b.GateMaxStaleSeconds &&
		slices.Equal(a.ProcessDenylist, b.ProcessDenylist) &&
		slices.Equal(a.ForegroundDenylist, b.ForegroundDenylist) &&
		slices.Equal(a.ForegroundAllowlist, b.ForegroundAllowlist)
}

// A malformed or cleared settings row must never widen or silence detection
// quietly. Every one of these cases used to be a compiled-in constant that could
// only change through a code review, so the fallbacks are what replaces that
// review.
func TestBuildSnapshotFallsBackPerField(t *testing.T) {
	defaults := DefaultPolicy()

	tests := []struct {
		name   string
		values map[string]string
		assert func(*testing.T, Policy)
	}{
		{
			name:   "an empty table yields the compiled-in policy",
			values: map[string]string{},
			assert: func(t *testing.T, p Policy) {
				if !slices.Equal(p.ProcessDenylist, defaults.ProcessDenylist) {
					t.Errorf("ProcessDenylist = %v, want the compiled-in list", p.ProcessDenylist)
				}
				if p.HeartbeatSeconds != defaults.HeartbeatSeconds {
					t.Errorf("HeartbeatSeconds = %d, want %d", p.HeartbeatSeconds, defaults.HeartbeatSeconds)
				}
			},
		},
		{
			name:   "a cleared denylist keeps detection on rather than silently disabling it",
			values: map[string]string{"proctor.process_denylist": "   ,  , "},
			assert: func(t *testing.T, p Policy) {
				if !slices.Equal(p.ProcessDenylist, defaults.ProcessDenylist) {
					t.Errorf("ProcessDenylist = %v, want the compiled-in list", p.ProcessDenylist)
				}
			},
		},
		{
			name:   "a zero cadence is refused, not clamped",
			values: map[string]string{"proctor.heartbeat_seconds": "0"},
			assert: func(t *testing.T, p Policy) {
				if p.HeartbeatSeconds != defaults.HeartbeatSeconds {
					t.Errorf("HeartbeatSeconds = %d, want %d", p.HeartbeatSeconds, defaults.HeartbeatSeconds)
				}
			},
		},
		{
			name:   "garbage in a numeric field costs only that field",
			values: map[string]string{"proctor.port_probe_seconds": "soon", "proctor.heartbeat_seconds": "30"},
			assert: func(t *testing.T, p Policy) {
				if p.PortProbeSeconds != defaults.PortProbeSeconds {
					t.Errorf("PortProbeSeconds = %d, want the default %d", p.PortProbeSeconds, defaults.PortProbeSeconds)
				}
				if p.HeartbeatSeconds != 30 {
					t.Errorf("HeartbeatSeconds = %d, want the configured 30", p.HeartbeatSeconds)
				}
			},
		},
		{
			name: "terms are trimmed, lowercased and deduplicated",
			values: map[string]string{
				"proctor.process_denylist": " Ollama , vLLM,,ollama , LM Studio ",
			},
			assert: func(t *testing.T, p Policy) {
				want := []string{"ollama", "vllm", "lm studio"}
				if !slices.Equal(p.ProcessDenylist, want) {
					t.Errorf("ProcessDenylist = %v, want %v", p.ProcessDenylist, want)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.assert(t, buildSnapshot(tt.values, nil).policy)
		})
	}
}

// A configured value that parses must actually take effect, or the whole exercise
// is a no-op that looks like a feature.
func TestBuildSnapshotAppliesConfiguredValues(t *testing.T) {
	snapshot := buildSnapshot(map[string]string{
		"proctor.heartbeat_seconds":      "20",
		"proctor.port_probe_seconds":     "120",
		"proctor.keepalive_seconds":      "600",
		"proctor.rules_refresh_seconds":  "60",
		"proctor.gate_max_stale_seconds": "120",
		"proctor.process_denylist":       "ollama",
		"proctor.foreground_denylist":    "com.ollama",
		"proctor.foreground_allowlist":   "com.google.chrome,code",
	}, nil)

	if snapshot.degraded {
		t.Error("a fully configured table must not report a fallback")
	}
	got := snapshot.policy
	if got.HeartbeatSeconds != 20 || got.PortProbeSeconds != 120 || got.KeepaliveSeconds != 600 {
		t.Errorf("cadences = %d/%d/%d, want 20/120/600",
			got.HeartbeatSeconds, got.PortProbeSeconds, got.KeepaliveSeconds)
	}
	if got.GateMaxStaleSeconds != 120 || got.RulesRefreshSeconds != 60 {
		t.Errorf("gate/refresh = %d/%d, want 120/60", got.GateMaxStaleSeconds, got.RulesRefreshSeconds)
	}
	if !slices.Equal(got.ProcessDenylist, []string{"ollama"}) {
		t.Errorf("ProcessDenylist = %v, want [ollama]", got.ProcessDenylist)
	}
	if !slices.Equal(got.ForegroundAllowlist, []string{"com.google.chrome", "code"}) {
		t.Errorf("ForegroundAllowlist = %v, want [com.google.chrome, code]", got.ForegroundAllowlist)
	}
}
