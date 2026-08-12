package agent

// Access modes and the grants that unlock them.
//
// Three ways to sit the contest are supported, and they are not equally
// observable:
//
//	DESKTOP        the portal runs inside the desktop client, with the agent live
//	               behind it — everything the proctor can see, it sees
//	WEB_WITH_AGENT the portal runs in the contestant's own browser while the agent
//	               keeps reporting from the same machine — endpoint signals still
//	               land, but nothing corroborates which window the code was typed in
//	WEB_ONLY       a browser with no live agent at all — no endpoint signals exist
//
// All three work. Only the first is available by default, because the other two
// each give up something an organizer may not be willing to give up silently, and
// a fallback that needs no decision is the fallback everyone ends up using.

// AccessMode is how a scored submission actually reached the server: which client
// the contestant used, and whether an agent was reporting behind it.
type AccessMode string

const (
	ModeDesktopShell AccessMode = "DESKTOP"
	ModeWebWithAgent AccessMode = "WEB_WITH_AGENT"
	ModeWebOnly      AccessMode = "WEB_ONLY"
)

// AllAccessModes is every mode, in decreasing observability. Iterating this rather
// than hand-listing modes at each call site is what keeps a future fourth mode from
// being silently omitted from a permission check or a UI.
var AllAccessModes = []AccessMode{ModeDesktopShell, ModeWebWithAgent, ModeWebOnly}

// AccessGrant is which modes an account may make scored submissions from.
//
// The two fallbacks are independent switches, not a ladder: organizers asked to be
// able to allow a machine that cannot run the client at all without thereby
// blessing "browser while the agent runs" for the same person, and vice versa.
//
// DESKTOP has no field because it is never withheld. A contestant with no grants is
// not locked out of the contest — they are expected in the client, which is what
// every account gets.
//
// Worth knowing when combining them: allowing WEB_ONLY without WEB_WITH_AGENT is
// enforceable but perverse, since a contestant in that position unlocks their own
// submissions by stopping the agent. The API accepts it because an organizer may
// have a reason; the admin console warns rather than silently normalising.
type AccessGrant struct {
	WebWithAgent bool `json:"web_with_agent"`
	WebOnly      bool `json:"web_only"`
}

// Allows reports whether this grant permits a scored submission in mode m. An
// unknown mode is refused: a mode the grant cannot reason about must not be
// permitted by omission.
func (g AccessGrant) Allows(m AccessMode) bool {
	switch m {
	case ModeDesktopShell:
		return true
	case ModeWebWithAgent:
		return g.WebWithAgent
	case ModeWebOnly:
		return g.WebOnly
	default:
		return false
	}
}

// Modes lists what this grant permits, so the portal and the admin console can
// describe it without reimplementing Allows.
func (g AccessGrant) Modes() []AccessMode {
	modes := make([]AccessMode, 0, len(AllAccessModes))
	for _, m := range AllAccessModes {
		if g.Allows(m) {
			modes = append(modes, m)
		}
	}
	return modes
}

// IsDefault reports whether nothing beyond the desktop client has been granted.
func (g AccessGrant) IsDefault() bool {
	return !g.WebWithAgent && !g.WebOnly
}

// Perverse reports the one combination that works against the organizer setting it:
// permitting submissions with no agent while refusing them with one. A contestant
// holding it unlocks their submissions by stopping proctoring.
func (g AccessGrant) Perverse() bool {
	return g.WebOnly && !g.WebWithAgent
}

// UnionAccessGrant merges the contest-wide floor with one contestant's grant.
//
// Either source may enable a mode and neither can take one away: opening a fallback
// for everyone must not narrow the person who already had a personal grant, and a
// personal grant must not be capped by a floor set for an unrelated reason.
func UnionAccessGrant(a, b AccessGrant) AccessGrant {
	return AccessGrant{
		WebWithAgent: a.WebWithAgent || b.WebWithAgent,
		WebOnly:      a.WebOnly || b.WebOnly,
	}
}

// ParseAccessMode maps stored or submitted text to a mode, reporting whether it was
// recognised. Callers validating an organizer's input must refuse on !ok rather than
// guessing at what was meant.
func ParseAccessMode(raw string) (AccessMode, bool) {
	for _, m := range AllAccessModes {
		if AccessMode(raw) == m {
			return m, true
		}
	}
	return "", false
}
