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
			name:  "the default permits the desktop client and nothing else",
			grant: AccessGrant{},
			want: map[AccessMode]bool{
				ModeDesktopShell: true, ModeWebWithAgent: false, ModeWebOnly: false,
			},
		},
		{
			name:  "browser with an agent does not imply browser without one",
			grant: AccessGrant{WebWithAgent: true},
			want: map[AccessMode]bool{
				ModeDesktopShell: true, ModeWebWithAgent: true, ModeWebOnly: false,
			},
		},
		{
			// Independent flags, so this really is refusable — and it is the perverse
			// combination the admin console warns about, not a normalisation bug.
			name:  "browser without an agent does not imply browser with one",
			grant: AccessGrant{WebOnly: true},
			want: map[AccessMode]bool{
				ModeDesktopShell: true, ModeWebWithAgent: false, ModeWebOnly: true,
			},
		},
		{
			name:  "both flags permit all three",
			grant: AccessGrant{WebWithAgent: true, WebOnly: true},
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
	for _, g := range []AccessGrant{{}, {WebWithAgent: true}, {WebOnly: true}, {WebWithAgent: true, WebOnly: true}} {
		if !g.Allows(ModeDesktopShell) {
			t.Errorf("%+v refused the desktop client", g)
		}
	}
}

func TestAccessGrantModesAndFlags(t *testing.T) {
	if got := (AccessGrant{}).Modes(); len(got) != 1 || got[0] != ModeDesktopShell {
		t.Errorf("default Modes() = %v, want just %q", got, ModeDesktopShell)
	}
	if !(AccessGrant{}).IsDefault() {
		t.Error("the zero grant must report as default")
	}
	if (AccessGrant{WebWithAgent: true}).IsDefault() {
		t.Error("a granted fallback must not report as default")
	}

	// Named so an organizer can be warned about it rather than surprised by it: a
	// contestant here unlocks their own submissions by stopping the agent.
	if !(AccessGrant{WebOnly: true}).Perverse() {
		t.Error("web-only without web-with-agent is the perverse combination")
	}
	for _, g := range []AccessGrant{{}, {WebWithAgent: true}, {WebWithAgent: true, WebOnly: true}} {
		if g.Perverse() {
			t.Errorf("%+v was flagged perverse", g)
		}
	}
}

// A grant must never be narrowed by the contest-wide floor, and raising the floor
// must never narrow a grant. Both directions matter: the two levers are set by
// different people at different times for unrelated reasons.
func TestUnionAccessGrant(t *testing.T) {
	tests := []struct {
		floor, granted, want AccessGrant
	}{
		{AccessGrant{}, AccessGrant{}, AccessGrant{}},
		{AccessGrant{}, AccessGrant{WebOnly: true}, AccessGrant{WebOnly: true}},
		{AccessGrant{WebWithAgent: true}, AccessGrant{}, AccessGrant{WebWithAgent: true}},
		{
			AccessGrant{WebWithAgent: true}, AccessGrant{WebOnly: true},
			AccessGrant{WebWithAgent: true, WebOnly: true},
		},
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

// Both contest-wide switches ship off. A fresh install that quietly allowed browser
// submissions would make the whole feature decorative.
func TestContestAccessGrantDefaultsClosed(t *testing.T) {
	s := &Settings{}

	s.snapshot.Store(&settingsSnapshot{values: map[string]string{}})
	if got := s.ContestAccessGrant(); !got.IsDefault() {
		t.Errorf("ContestAccessGrant() = %+v on an empty table, want nothing granted", got)
	}

	s.snapshot.Store(&settingsSnapshot{values: map[string]string{
		"access.allow_web_with_agent": "true",
	}})
	if got := s.ContestAccessGrant(); got != (AccessGrant{WebWithAgent: true}) {
		t.Errorf("ContestAccessGrant() = %+v, want only web-with-agent", got)
	}

	// Anything unparseable reads as off — a malformed row must not open the contest.
	s.snapshot.Store(&settingsSnapshot{values: map[string]string{
		"access.allow_web_only": "yes please",
	}})
	if got := s.ContestAccessGrant(); !got.IsDefault() {
		t.Errorf("ContestAccessGrant() = %+v for an unparseable row, want nothing granted", got)
	}
}

// The migration seeds the same closed defaults the settings reader looks for. Drift
// in either the keys or the values would mean a fresh install and an upgraded one
// disagree about who may submit from a browser.
func TestMigrationSeedsClosedAccessDefaults(t *testing.T) {
	raw, err := os.ReadFile("../db/migrations/0009_access_modes.sql")
	if err != nil {
		t.Fatalf("read access migration: %v", err)
	}
	sql := string(raw)

	for _, key := range []string{"access.allow_web_with_agent", "access.allow_web_only"} {
		if !strings.Contains(sql, "('"+key+"', 'false')") {
			t.Errorf("0009 does not seed %s to 'false'", key)
		}
	}

	// The gate reads these columns by name; a rename on one side only would fail at
	// the database on every single submission.
	for _, column := range []string{"proctor_allow_web_with_agent", "proctor_allow_web_only"} {
		if !strings.Contains(sql, column) {
			t.Errorf("0009 never mentions %s", column)
		}
	}
}
