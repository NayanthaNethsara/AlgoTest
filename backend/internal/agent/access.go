package agent

type AccessMode string

const (
	ModeDesktopShell AccessMode = "DESKTOP"
	ModeWebWithAgent AccessMode = "WEB_WITH_AGENT"
	ModeWebOnly      AccessMode = "WEB_ONLY"
)

var AllAccessModes = []AccessMode{ModeDesktopShell, ModeWebWithAgent, ModeWebOnly}

type AccessGrant struct {
	WebWithAgent bool `json:"web_with_agent"`
	WebOnly      bool `json:"web_only"`
}

func (g AccessGrant) Allows(m AccessMode) bool {
	switch m {
	case ModeDesktopShell, ModeWebWithAgent:
		return true
	case ModeWebOnly:
		return g.WebOnly
	default:
		return false
	}
}

func (g AccessGrant) Modes() []AccessMode {
	modes := make([]AccessMode, 0, len(AllAccessModes))
	for _, m := range AllAccessModes {
		if g.Allows(m) {
			modes = append(modes, m)
		}
	}
	return modes
}

func (g AccessGrant) IsDefault() bool {
	return !g.WebOnly
}

func UnionAccessGrant(a, b AccessGrant) AccessGrant {
	return AccessGrant{
		WebWithAgent: a.WebWithAgent || b.WebWithAgent,
		WebOnly:      a.WebOnly || b.WebOnly,
	}
}

func ParseAccessMode(raw string) (AccessMode, bool) {
	for _, m := range AllAccessModes {
		if AccessMode(raw) == m {
			return m, true
		}
	}
	return "", false
}
