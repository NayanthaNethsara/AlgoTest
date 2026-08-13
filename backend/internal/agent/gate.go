package agent

import (
	"context"
	"time"
)

// Block codes returned to the client. 423 Locked carries them; 403 reads as
// authorization and 409 is already taken by ErrActiveSubmissionExists.
const (
	CodeAgentMissing = "AGENT_MISSING"
	CodeAgentStale   = "AGENT_STALE"
	CodeAgentStopped = "AGENT_STOPPED"
	CodeNotAttested  = "NOT_ATTESTED"
	// CodeClientNotAllowed is the browser turned away while the agent is perfectly
	// healthy. Distinct from the AGENT_* codes on purpose: telling someone whose
	// proctor client is running fine to restart it sends them in circles.
	CodeClientNotAllowed = "CLIENT_NOT_ALLOWED"
)

type ActiveClient string

const (
	ClientDesktopShell ActiveClient = "DESKTOP"
	ClientBrowser      ActiveClient = "WEB"
)

// GateInput is the decision's whole world, so the decision itself stays pure and
// testable.
type GateInput struct {
	Exempt       bool
	ExemptReason string
	HasAgent     bool
	LastSeenAt   *time.Time
	StoppedAt    *time.Time
	ShellAlive   bool
	// ShellSeenAt is when the desktop shell was last seen by the agent, which is not
	// the same question as whether the newest heartbeat caught it — see
	// ShellGraceSeconds.
	ShellSeenAt   *time.Time
	AttestOK      bool
	RequireAttest bool
	IncidentOpen  bool
	// ClaimsDesktop is the requesting client's own claim to be the desktop shell,
	// carried by the marker the client sets in the window it opens. It is believed
	// only where the agent's own report of the shell corroborates it — see
	// resolveMode.
	ClaimsDesktop bool
	// Grant is the effective permission set for this contestant: the contest-wide
	// floor merged with their personal grant. The zero value permits the desktop
	// client only, so an unset field fails closed.
	Grant AccessGrant
	// AccessReason is why the grant exists. Recorded with the finding so a reviewer
	// reading "submitted from a browser" also reads the organizer's justification
	// for permitting it.
	AccessReason string
	ClientIP     string
	// ClientIPTrusted is false when ClientIP is a proxy hop rather than the
	// contestant's own address. Comparing a portal host against the agent's LAN IP
	// produces a mismatch on every honest submission, so the comparison is omitted
	// rather than reported as if it meant something.
	ClientIPTrusted bool
	AgentLanIP      string
	MaxStaleSeconds int
}

type finding struct {
	RuleID   string
	Weight   int
	Evidence map[string]any
}

type Decision struct {
	Allowed          bool         `json:"allowed"`
	Code             string       `json:"code,omitempty"`
	Exempt           bool         `json:"exempt"`
	Attested         bool         `json:"attested"`
	ActiveClient     ActiveClient `json:"active_client"`
	AccessMode       AccessMode   `json:"access_mode"`
	Grant            AccessGrant  `json:"grant"`
	AllowedModes     []AccessMode `json:"allowed_modes"`
	LastSeenAt       *time.Time   `json:"last_seen_at,omitempty"`
	SecondsSincePing int          `json:"seconds_since_ping"`
	Remedy           string       `json:"remedy,omitempty"`
	findings         []finding
}

// ShellGraceSeconds is how long a shell sighting keeps corroborating a desktop
// claim after the newest heartbeat stopped confirming it.
//
// The chain is lossy by construction: the shell pings the agent every 10s, the
// agent forgets it after 30s, and the agent reports to the server every 15s. A
// laptop resuming from sleep, or a shell stalled under load, therefore produces one
// heartbeat that says false while the contestant sits in front of the client doing
// nothing wrong. Refusing them would be this gate's worst failure, so a sighting
// counts for the same 90s a missing agent heartbeat is tolerated for.
//
// The cost is bounded and worth naming: for 90s after genuinely closing the client,
// a hand-forged marker in a browser would pass as DESKTOP. That requires having just
// run the proctored client, so it buys a contestant a minute and a half of the
// weaker mode, never an unproctored one.
const ShellGraceSeconds = GateMaxStaleSeconds

// resolveMode names how this submission arrived.
//
// The desktop claim is only believed where the agent independently places its shell
// process on that machine. That pairing is what stops the marker — a cookie the
// contestant's own browser can be made to send — from being an authorization: to
// forge DESKTOP you must actually be running the desktop client, which means the
// proctor is watching you anyway. WEB_ONLY cannot be forged in either direction,
// because it is the absence of agent reports rather than any client's assertion.
func resolveMode(in GateInput, agentLive bool, now time.Time) AccessMode {
	switch {
	case !agentLive:
		return ModeWebOnly
	case in.ClaimsDesktop && shellPresent(in, now):
		return ModeDesktopShell
	default:
		return ModeWebWithAgent
	}
}

func shellPresent(in GateInput, now time.Time) bool {
	if in.ShellAlive {
		return true
	}
	return in.ShellSeenAt != nil &&
		now.Sub(*in.ShellSeenAt) <= ShellGraceSeconds*time.Second
}

// Decide resolves whether a scored submission may proceed. Liveness is a property
// of the *agent*, never of whichever client is submitting — that is what lets the
// browser be a real fallback rather than a way around proctoring, for contestants
// an organizer has granted the mode that unlocks it.
func Decide(in GateInput, now time.Time) Decision {
	maxStale := in.MaxStaleSeconds
	if maxStale <= 0 {
		maxStale = GateMaxStaleSeconds
	}
	grant := in.Grant

	d := Decision{
		Attested:     in.AttestOK,
		Grant:        grant,
		AllowedModes: grant.Modes(),
	}
	if in.LastSeenAt != nil {
		d.LastSeenAt = in.LastSeenAt
		d.SecondsSincePing = int(now.Sub(*in.LastSeenAt).Seconds())
	}

	agentLive := in.HasAgent && in.LastSeenAt != nil && d.SecondsSincePing <= maxStale
	d.AccessMode = resolveMode(in, agentLive, now)
	d.ActiveClient = ClientBrowser
	if d.AccessMode == ModeDesktopShell {
		d.ActiveClient = ClientDesktopShell
	}

	if in.Exempt {
		d.Allowed = true
		d.Exempt = true
		d.findings = append(d.findings, finding{"tel.exempt", 15, map[string]any{
			"reason": in.ExemptReason,
		}})
		return d
	}

	// No live agent. Allowed only where an organizer granted this mode explicitly —
	// for everyone else this is the pre-existing lockout, reported with the code that
	// names the condition they can actually fix.
	if d.AccessMode == ModeWebOnly {
		if grant.Allows(ModeWebOnly) {
			d.Allowed = true
			d.findings = append(d.findings, finding{"tel.web_only_grant", 15, map[string]any{
				"reason":             in.AccessReason,
				"has_agent":          in.HasAgent,
				"seconds_since_ping": d.SecondsSincePing,
			}})
			return d
		}

		if !in.HasAgent || in.LastSeenAt == nil {
			d.Code = CodeAgentMissing
			d.Remedy = "Install and start the proctor client, then sign in once to enroll it."
			d.findings = append(d.findings, finding{"tel.no_agent_submit", 25, map[string]any{
				"reason": "no enrolled agent has ever reported",
			}})
			return d
		}

		// A fleet-wide outage is ours, not the contestant's. Blocking here would
		// punish 300 people for one nginx reload.
		if in.IncidentOpen {
			d.Allowed = true
			d.Remedy = "Proctoring telemetry is degraded server-side; your submission was accepted."
			return d
		}
		if in.StoppedAt != nil {
			d.Code = CodeAgentStopped
			d.Remedy = "You stopped proctoring. Start the proctor client to submit again."
		} else {
			d.Code = CodeAgentStale
			d.Remedy = "The proctor client is not reporting. Restart it, then submit again."
		}
		d.findings = append(d.findings, finding{"tel.no_agent_submit", 25, map[string]any{
			"seconds_since_ping": d.SecondsSincePing,
			"stopped":            in.StoppedAt != nil,
		}})
		return d
	}

	if d.AccessMode == ModeWebWithAgent {
		// Recorded whether or not it is permitted: an organizer wants "worked in a
		// browser" in the review timeline even when they are the one who allowed it.
		d.findings = append(d.findings, finding{"tel.web_client", 15, map[string]any{
			"reason":       "submitted from the browser fallback rather than the desktop client",
			"claims_shell": in.ClaimsDesktop,
			"shell_alive":  in.ShellAlive,
			"granted":      grant.Allows(ModeWebWithAgent),
		}})
		if !grant.Allows(ModeWebWithAgent) {
			d.Code = CodeClientNotAllowed
			d.Remedy = "Scored submissions must come from the proctor client window. Open the contest there, or ask an organizer to allow browser access for your account."
			return d
		}
	}

	if !in.AttestOK {
		// Loopback attestation proves the submitting browser is on the same
		// machine as the live agent. Its absence is not proof of anything, so it
		// is a review signal by default and a block only when organizers turn
		// the lever on.
		evidence := map[string]any{"agent_lan_ip": in.AgentLanIP}
		if in.ClientIPTrusted {
			evidence["client_ip"] = in.ClientIP
			evidence["ip_mismatch"] = in.AgentLanIP != "" && in.ClientIP != "" && in.AgentLanIP != in.ClientIP
		} else {
			// Say so explicitly. A reviewer who sees no ip_mismatch key must be able
			// to tell "the addresses matched" from "we never knew the address".
			evidence["client_ip_unknown"] = "portal did not forward a trusted client address"
		}
		d.findings = append(d.findings, finding{"tel.no_attest", 20, evidence})
		if in.RequireAttest {
			d.Code = CodeNotAttested
			d.Remedy = "Submit from the proctor client, or reload the portal so it can reach the agent."
			return d
		}
	}

	if d.SecondsSincePing > 30 {
		d.findings = append(d.findings, finding{"tel.disconnect_gap", 10, map[string]any{
			"seconds_since_ping": d.SecondsSincePing,
			"access_mode":        d.AccessMode,
		}})
	}

	d.Allowed = true
	return d
}

// Gate resolves and records. Findings are written for allowed submissions too —
// "submitted from the browser, unattested" is exactly the sort of thing an
// organizer wants in the review timeline rather than silently permitted.
type Gate struct {
	repo     *Repository
	service  *Service
	settings *Settings
}

func NewGate(repo *Repository, service *Service, settings *Settings) *Gate {
	return &Gate{repo: repo, service: service, settings: settings}
}

// maxStaleSeconds is the live threshold. Reading the compiled-in constant here
// instead would leave organizers a lever in contest_settings that visibly changed
// nothing about whether a submission was accepted.
func (g *Gate) maxStaleSeconds() int {
	if g.settings == nil {
		return GateMaxStaleSeconds
	}
	return g.settings.Policy().GateMaxStaleSeconds
}

// effectiveGrant merges one contestant's grant with the contest-wide floor.
func (g *Gate) effectiveGrant(granted AccessGrant) AccessGrant {
	if g.settings == nil {
		return granted
	}
	return UnionAccessGrant(g.settings.ContestAccessGrant(), granted)
}

// CheckRequest is what the submission path knows about the caller that the stored
// state cannot tell the gate itself.
type CheckRequest struct {
	UserID string
	// ClaimsDesktop is set when the portal forwarded the desktop client's marker.
	ClaimsDesktop   bool
	ClientIP        string
	ClientIPTrusted bool
	AttestNonce     string
}

func (g *Gate) Check(ctx context.Context, req CheckRequest) (Decision, error) {
	state, err := g.repo.GateState(ctx, req.UserID)
	if err != nil {
		return Decision{}, err
	}

	attestOK := false
	if req.AttestNonce != "" {
		attestOK, err = g.repo.VerifyNonce(ctx, req.UserID, req.AttestNonce)
		if err != nil {
			return Decision{}, err
		}
	}

	requireAttest := false
	if g.settings != nil {
		requireAttest = g.settings.RequireAgentAttest()
	}

	d := Decide(GateInput{
		Exempt:          state.Exempt,
		ExemptReason:    state.ExemptReason,
		HasAgent:        state.HasAgent,
		LastSeenAt:      state.LastSeenAt,
		StoppedAt:       state.StoppedAt,
		ShellAlive:      state.ShellAlive,
		ShellSeenAt:     state.ShellSeenAt,
		AttestOK:        attestOK,
		RequireAttest:   requireAttest,
		IncidentOpen:    state.IncidentOpen,
		ClaimsDesktop:   req.ClaimsDesktop,
		Grant:           g.effectiveGrant(state.Grant),
		AccessReason:    state.AccessReason,
		ClientIP:        req.ClientIP,
		ClientIPTrusted: req.ClientIPTrusted,
		AgentLanIP:      state.LanIP,
		MaxStaleSeconds: g.maxStaleSeconds(),
	}, time.Now())

	if g.service != nil {
		for _, f := range d.findings {
			g.service.record(ctx, req.UserID, f.RuleID, f.Weight, f.Evidence)
		}
	}

	return d, nil
}

// Status is the read-only view the portal polls so contestants learn their agent
// is down — or that the window they are working in will not be accepted — while
// coding, not with ninety seconds left on the clock.
//
// claimsDesktop comes from the polling client, so the answer describes the window
// the contestant is actually looking at rather than the most permissive one they
// could open.
func (g *Gate) Status(ctx context.Context, userID string, claimsDesktop bool) (Decision, int, error) {
	state, err := g.repo.GateState(ctx, userID)
	if err != nil {
		return Decision{}, 0, err
	}

	d := Decide(GateInput{
		Exempt:          state.Exempt,
		ExemptReason:    state.ExemptReason,
		HasAgent:        state.HasAgent,
		LastSeenAt:      state.LastSeenAt,
		StoppedAt:       state.StoppedAt,
		ShellAlive:      state.ShellAlive,
		ShellSeenAt:     state.ShellSeenAt,
		AttestOK:        true, // attestation is a per-submission property
		IncidentOpen:    state.IncidentOpen,
		ClaimsDesktop:   claimsDesktop,
		Grant:           g.effectiveGrant(state.Grant),
		AccessReason:    state.AccessReason,
		MaxStaleSeconds: g.maxStaleSeconds(),
	}, time.Now())
	d.findings = nil

	return d, state.LoopbackPort, nil
}
