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
)

type ActiveClient string

const (
	ClientDesktopShell ActiveClient = "DESKTOP"
	ClientBrowser      ActiveClient = "WEB"
)

// GateInput is the decision's whole world, so the decision itself stays pure and
// testable.
type GateInput struct {
	Exempt        bool
	ExemptReason  string
	HasAgent      bool
	LastSeenAt    *time.Time
	StoppedAt     *time.Time
	ShellAlive    bool
	AttestOK      bool
	RequireAttest bool
	IncidentOpen  bool
	ClientIP      string
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
	LastSeenAt       *time.Time   `json:"last_seen_at,omitempty"`
	SecondsSincePing int          `json:"seconds_since_ping"`
	Remedy           string       `json:"remedy,omitempty"`
	findings         []finding
}

// Decide resolves whether a scored submission may proceed. Liveness is a property
// of the *agent*, never of whichever client is submitting — that is what lets the
// browser be a real fallback rather than a way around proctoring.
func Decide(in GateInput, now time.Time) Decision {
	maxStale := in.MaxStaleSeconds
	if maxStale <= 0 {
		maxStale = GateMaxStaleSeconds
	}

	d := Decision{ActiveClient: ClientDesktopShell, Attested: in.AttestOK}
	if !in.ShellAlive {
		d.ActiveClient = ClientBrowser
	}
	if in.LastSeenAt != nil {
		d.LastSeenAt = in.LastSeenAt
		d.SecondsSincePing = int(now.Sub(*in.LastSeenAt).Seconds())
	}

	if in.Exempt {
		d.Allowed = true
		d.Exempt = true
		d.findings = append(d.findings, finding{"tel.exempt", 15, map[string]any{
			"reason": in.ExemptReason,
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

	if d.SecondsSincePing > maxStale {
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

	if d.ActiveClient == ClientBrowser {
		d.findings = append(d.findings, finding{"tel.web_client", 15, map[string]any{
			"reason": "submitted from the browser fallback while the desktop shell was not running",
		}})
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

func (g *Gate) Check(ctx context.Context, userID, clientIP string, clientIPTrusted bool, attestNonce string) (Decision, error) {
	state, err := g.repo.GateState(ctx, userID)
	if err != nil {
		return Decision{}, err
	}

	attestOK := false
	if attestNonce != "" {
		attestOK, err = g.repo.VerifyNonce(ctx, userID, attestNonce)
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
		AttestOK:        attestOK,
		RequireAttest:   requireAttest,
		IncidentOpen:    state.IncidentOpen,
		ClientIP:        clientIP,
		ClientIPTrusted: clientIPTrusted,
		AgentLanIP:      state.LanIP,
		MaxStaleSeconds: g.maxStaleSeconds(),
	}, time.Now())

	if g.service != nil {
		for _, f := range d.findings {
			g.service.record(ctx, userID, f.RuleID, f.Weight, f.Evidence)
		}
	}

	return d, nil
}

// Status is the read-only view the portal polls so contestants learn their agent
// is down while coding, not with ninety seconds left on the clock.
func (g *Gate) Status(ctx context.Context, userID string) (Decision, int, error) {
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
		AttestOK:        true, // attestation is a per-submission property
		IncidentOpen:    state.IncidentOpen,
		MaxStaleSeconds: g.maxStaleSeconds(),
	}, time.Now())
	d.findings = nil

	return d, state.LoopbackPort, nil
}
