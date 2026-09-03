package agent

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/proctor"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/telemetry"
)

// KeepaliveInterval is how often a heartbeat is persisted as an event even when
// nothing changed, so a quiet endpoint still leaves a continuous trail. It is the
// fallback for proctor.keepalive_seconds, which overrides it.
//
// This is the lever that decides how much the trail costs: every keepalive is a
// row, so 300 agents at the default write 300 rows per five minutes on top of
// whatever their signal changes produce.
const KeepaliveInterval = 5 * time.Minute

type Service struct {
	repo     *Repository
	batcher  *telemetry.Batcher
	eval     *proctor.Evaluator
	settings *Settings
	log      *slog.Logger
}

func NewService(repo *Repository, batcher *telemetry.Batcher, eval *proctor.Evaluator, settings *Settings, log *slog.Logger) *Service {
	return &Service{repo: repo, batcher: batcher, eval: eval, settings: settings, log: log}
}

// Policy is the live policy, served to agents and used to evaluate their reports.
// This is an atomic pointer load, not a query — see Settings.
func (s *Service) Policy() Policy {
	if s.settings == nil {
		return DefaultPolicy()
	}
	return s.settings.Policy()
}

func (s *Service) Repo() *Repository { return s.repo }

func (s *Service) Settings() *Settings { return s.settings }

// Classify decides what this heartbeat says about the agent's own integrity,
// independently of what it observed on the endpoint.
func Classify(a Agent, hb Heartbeat, serverNow time.Time) Integrity {
	var integ Integrity

	sameBoot := a.BootID != nil && *a.BootID == hb.BootID
	integ.NewBoot = !sameBoot && a.BootID != nil
	integ.CleanRestart = integ.NewBoot && a.StoppedAt != nil
	integ.SeqReplay = sameBoot && hb.Seq > 0 && hb.Seq <= a.Seq

	// A wrong-but-steady clock is just a wrong clock. What matters is the offset
	// *changing* — that is someone moving the clock during the contest. Buffered
	// replays carry an old wall stamp by definition, so they are exempt.
	if !hb.Buffered && !hb.WallTS.IsZero() {
		offset := hb.WallTS.Sub(serverNow).Milliseconds()
		if a.ClockOffsetMs != nil {
			if delta := offset - *a.ClockOffsetMs; delta > ClockSkewToleranceMs || delta < -ClockSkewToleranceMs {
				integ.ClockSkewMs = delta
			}
		}
	}

	return integ
}

func clockOffset(hb Heartbeat, serverNow time.Time) int64 {
	if hb.WallTS.IsZero() {
		return 0
	}
	return hb.WallTS.Sub(serverNow).Milliseconds()
}

// Heartbeat ingests one live heartbeat: integrity first, then liveness, then
// signal evaluation. Signal evaluation is skipped when the signal hash is
// unchanged, which is what makes 33 heartbeats/second cheap.
func (s *Service) Heartbeat(ctx context.Context, a Agent, hb Heartbeat, clientIP string) error {
	if hb.Buffered {
		return s.replay(ctx, a, hb)
	}

	now := time.Now().UTC()
	integ := Classify(a, hb, now)

	if integ.SeqReplay {
		s.record(ctx, a.UserID, "tel.seq_replay", 60, map[string]any{
			"boot_id":      hb.BootID,
			"reported_seq": hb.Seq,
			"known_seq":    a.Seq,
		})
		// A replayed sequence is not evidence of liveness. Refuse it outright
		// rather than letting a captured heartbeat hold the gate open.
		return ErrUnknownAgent
	}

	if integ.NewBoot && !integ.CleanRestart {
		s.record(ctx, a.UserID, "tel.agent_crash", 10, map[string]any{
			"previous_boot_id": a.BootID,
			"new_boot_id":      hb.BootID,
			"last_seen_at":     a.LastSeenAt,
		})
	}

	if integ.ClockSkewMs != 0 {
		s.record(ctx, a.UserID, "tel.clock_skew", 20, map[string]any{
			"delta_ms":    integ.ClockSkewMs,
			"agent_wall":  hb.WallTS,
			"server_wall": now,
		})
	}

	observedAt := now

	signalsChanged := hb.SignalHash == "" || hb.SignalHash != a.SignalHash
	keepalive := time.Duration(s.Policy().KeepaliveSeconds) * time.Second
	if keepalive <= 0 {
		keepalive = KeepaliveInterval
	}
	keepaliveDue := a.LastEventAt == nil || now.Sub(*a.LastEventAt) >= keepalive
	writeEvent := signalsChanged || keepaliveDue || integ.NewBoot

	if writeEvent {
		eventType := "keepalive"
		switch {
		case integ.NewBoot:
			eventType = "boot"
		case signalsChanged:
			eventType = "signal_change"
		}
		payload, err := json.Marshal(hb.Signals)
		if err != nil {
			payload = []byte("{}")
		}
		if err := s.repo.AppendEvent(ctx, a.UserID, a.ID, hb.BootID, eventType, hb.SignalHash, hb.Seq, payload, observedAt); err != nil && s.log != nil {
			s.log.Error("failed to append telemetry event", "user_id", a.UserID, "error", err)
		}
	}

	if err := s.repo.RecordHeartbeat(ctx, a.ID, hb, clockOffset(hb, now), writeEvent); err != nil {
		return err
	}

	ports, err := json.Marshal(hb.Signals.Ports)
	if err != nil {
		ports = []byte("[]")
	}

	row := telemetry.AgentRow{
		UserID:            a.UserID,
		AgentID:           a.ID,
		AgentVersion:      hb.AgentVersion,
		ActiveWindow:      hb.Signals.ForegroundApp,
		ForegroundDwell:   hb.Signals.ForegroundDwell,
		Ports:             ports,
		InternetReachable: hb.Signals.InternetReachable,
		ProcessMatches:    hb.Signals.ProcessMatches,
		TotalProcesses:    hb.Signals.TotalProcesses,
		LanIP:             hb.Signals.LanIP,
		ShellAlive:        hb.ShellAlive,
		OSInfo:            a.Platform,
		IPAddress:         clientIP,
		BootID:            hb.BootID,
		Seq:               hb.Seq,
		SignalHash:        hb.SignalHash,
		LastPingAt:        observedAt,
	}
	if s.batcher != nil {
		s.batcher.EnqueueAgent(row)
	}

	if signalsChanged && s.eval != nil {
		input := proctor.SignalInput{
			UserID:              a.UserID,
			InternetReachable:   hb.Signals.InternetReachable,
			ProcessMatches:      hb.Signals.ProcessMatches,
			ExtensionMatches:    hb.Signals.ExtensionMatches,
			TotalProcesses:      hb.Signals.TotalProcesses,
			ForegroundApp:       hb.Signals.ForegroundApp,
			ForegroundDwell:     hb.Signals.ForegroundDwell,
			ForegroundDenylist:  s.Policy().ForegroundDenylist,
			ForegroundAllowlist: s.Policy().ForegroundAllowlist,
		}
		for _, p := range hb.Signals.Ports {
			input.Ports = append(input.Ports, proctor.PortObservation{
				Port:      p.Port,
				RuleID:    p.RuleID,
				Product:   p.Product,
				Confirmed: p.Confirmed,
			})
		}
		if err := s.eval.ApplyEndpointSignals(ctx, input); err != nil && s.log != nil {
			s.log.Error("failed to evaluate endpoint signals", "user_id", a.UserID, "error", err)
		}
	}

	return nil
}

// replay files a heartbeat the agent buffered while the server was unreachable.
//
// A replay is *history*, not current state. It must never touch liveness, the live
// signal row, or the agent's boot/sequence state: the buffer can span an agent
// restart, so replaying it afterwards would rewind boot_id and make the next live
// heartbeat look like a crash — and would overwrite current signals with stale
// ones. It also must never move liveness forward, or an agent that is still
// offline could hold the gate open by flushing an hour-old backlog.
func (s *Service) replay(ctx context.Context, a Agent, hb Heartbeat) error {
	observedAt := time.Now().UTC()
	if !hb.WallTS.IsZero() {
		observedAt = hb.WallTS.UTC()
	}

	payload, err := json.Marshal(hb.Signals)
	if err != nil {
		payload = []byte("{}")
	}

	return s.repo.AppendEvent(ctx, a.UserID, a.ID, hb.BootID, "buffered", hb.SignalHash, hb.Seq, payload, observedAt)
}

// Shutdown records a deliberate stop. A clean stop is neutral evidence — the
// contestant is allowed to turn proctoring off, it simply locks submissions.
func (s *Service) Shutdown(ctx context.Context, a Agent, reason string) error {
	if reason == "" {
		reason = "contestant stopped proctoring"
	}
	return s.repo.MarkStopped(ctx, a.ID, reason)
}

func (s *Service) OnRebound(ctx context.Context, userID, machineID string) {
	s.record(ctx, userID, "tel.agent_rebound", 30, map[string]any{
		"new_machine_id": machineID,
	})
}

func (s *Service) record(ctx context.Context, userID, ruleID string, weight int, evidence map[string]any) {
	if s.eval == nil {
		return
	}
	if err := s.eval.RecordEvent(ctx, userID, ruleID, weight, evidence); err != nil && s.log != nil {
		s.log.Error("failed to record proctor event", "rule", ruleID, "user_id", userID, "error", err)
	}
}
