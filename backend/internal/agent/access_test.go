package agent

import (
	"os"
	"strings"
	"testing"
)

// Every access decision reduces to this table, so it is worth pinning exhaustively
// rather than through the cases the gate happens to exercise. The two fallbacks are
// independent by design: no combination implies another.
func TestAccessGrantAllows(t *testing.T) {
	tests := []struct {
		name  string
		grant AccessGrant
		want  map[AccessMode]bool
	}{
		{
			name:  "the default permits both desktop client and web browser with agent",
			grant: AccessGrant{},
			want: map[AccessMode]bool{
				ModeDesktopShell: true, ModeWebWithAgent: true, ModeWebOnly: false,
			},
		},
		{
			name:  "browser without an agent is unlocked when web_only is granted",
			grant: AccessGrant{WebOnly: true},
			want: map[AccessMode]bool{
				ModeDesktopShell: true, ModeWebWithAgent: true, ModeWebOnly: true,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, mode := range AllAccessModes {
				if got := tt.grant.Allows(mode); got != tt.want[mode] {
					t.Errorf("Allows(%q) = %v, want %v", mode, got, tt.want[mode])
				}
			}
			// A mode the grant cannot reason about must not pass by omission.
			if tt.grant.Allows(AccessMode("SOMETHING_ELSE")) {
				t.Error("an unknown mode was permitted")
			}
		})
	}
}

// The desktop client is never withheld, so no grant may refuse it — that is what
// makes an empty grant "work in the client" rather than "locked out of the contest".
func TestDesktopIsNeverWithheld(t *testing.T) {
	for _, g := range []AccessGrant{{}, {WebOnly: true}} {
		if !g.Allows(ModeDesktopShell) {
			t.Errorf("%+v refused the desktop client", g)
		}
	}
}

func TestAccessGrantModesAndFlags(t *testing.T) {
	if got := (AccessGrant{}).Modes(); len(got) != 2 || got[0] != ModeDesktopShell || got[1] != ModeWebWithAgent {
		t.Errorf("default Modes() = %v, want [%q, %q]", got, ModeDesktopShell, ModeWebWithAgent)
	}
	if !(AccessGrant{}).IsDefault() {
		t.Error("the zero grant must report as default")
	}
	if (AccessGrant{WebOnly: true}).IsDefault() {
		t.Error("a granted web-only fallback must not report as default")
	}
}

func TestUnionAccessGrant(t *testing.T) {
	tests := []struct {
		floor, granted, want AccessGrant
	}{
		{AccessGrant{}, AccessGrant{}, AccessGrant{}},
		{AccessGrant{}, AccessGrant{WebOnly: true}, AccessGrant{WebOnly: true}},
		{AccessGrant{WebOnly: true}, AccessGrant{}, AccessGrant{WebOnly: true}},
		{AccessGrant{WebOnly: true}, AccessGrant{WebOnly: true}, AccessGrant{WebOnly: true}},
	}

	for _, tt := range tests {
		if got := UnionAccessGrant(tt.floor, tt.granted); got != tt.want {
			t.Errorf("Union(%+v, %+v) = %+v, want %+v", tt.floor, tt.granted, got, tt.want)
		}
	}
}

func TestParseAccessModeRefusesUnknown(t *testing.T) {
	if _, ok := ParseAccessMode("web"); ok {
		t.Error(`"web" was accepted; a typo must be refused, not guessed at`)
	}
	if mode, ok := ParseAccessMode("WEB_ONLY"); !ok || mode != ModeWebOnly {
		t.Errorf("ParseAccessMode(WEB_ONLY) = %q, %v", mode, ok)
	}
}

func TestContestAccessGrantDefaults(t *testing.T) {
	s := &Settings{}

	s.snapshot.Store(&settingsSnapshot{values: map[string]string{}})
	if got := s.ContestAccessGrant(); !got.IsDefault() {
		t.Errorf("ContestAccessGrant() = %+v on an empty table, want default (no web_only)", got)
	}

	s.snapshot.Store(&settingsSnapshot{values: map[string]string{
		"access.allow_web_only": "true",
	}})
	if got := s.ContestAccessGrant(); got.WebOnly != true {
		t.Errorf("ContestAccessGrant() = %+v, want web_only true", got)
	}

	s.snapshot.Store(&settingsSnapshot{values: map[string]string{
		"access.allow_web_only": "invalid",
	}})
	if got := s.ContestAccessGrant(); !got.IsDefault() {
		t.Errorf("ContestAccessGrant() = %+v for an unparseable row, want default", got)
	}
}

func TestMigrationSeedsAccessDefaults(t *testing.T) {
	raw, err := os.ReadFile("../db/migrations/0009_access_modes.sql")
	if err != nil {
		t.Fatalf("read access migration: %v", err)
	}
	sql := string(raw)

	if !strings.Contains(sql, "'access.allow_web_only'") {
		t.Errorf("0009 does not seed access.allow_web_only")
	}

	if !strings.Contains(sql, "proctor_allow_web_only") {
		t.Errorf("0009 never mentions proctor_allow_web_only")
	}
}
