package agent

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/proctor"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/telemetry"
)

const KeepaliveInterval = 5 * time.Minute

const (
	incidentThresholdNumerator   = 3
	incidentThresholdDenominator = 10
	incidentMinFleet             = 10
)

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

func (s *Service) Policy() Policy {
	if s.settings == nil {
		return DefaultPolicy()
	}
	return s.settings.Policy()
}

func (s *Service) Repo() *Repository { return s.repo }

func (s *Service) Settings() *Settings { return s.settings }

func Classify(a Agent, hb Heartbeat, serverNow time.Time) Integrity {
	var integ Integrity

	sameBoot := a.BootID != nil && *a.BootID == hb.BootID
	integ.NewBoot = !sameBoot && a.BootID != nil
	integ.CleanRestart = integ.NewBoot && a.StoppedAt != nil
	integ.SeqReplay = sameBoot && hb.Seq > 0 && hb.Seq <= a.Seq

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

func (s *Service) Sweep(ctx context.Context) error {
	staleSeconds := s.Policy().GateMaxStaleSeconds

	health, err := s.repo.fleetHealth(ctx, staleSeconds)
	if err != nil {
		return err
	}

	fleetWide := health.Total >= incidentMinFleet &&
		health.Stale*incidentThresholdDenominator >= health.Total*incidentThresholdNumerator

	if fleetWide {
		opened, err := s.repo.openIncident(ctx, health.Stale, health.Total)
		if err != nil {
			return err
		}
		if opened && s.log != nil {
			s.log.Warn("fleet-wide telemetry loss; suppressing contestant gaps",
				"stale", health.Stale, "total", health.Total)
		}
		if _, err := s.repo.discardGapsInIncident(ctx); err != nil {
			return err
		}
		return nil
	}

	closed, err := s.repo.closeIncident(ctx)
	if err != nil {
		return err
	}
	if closed && s.log != nil {
		s.log.Info("fleet telemetry recovered", "stale", health.Stale, "total", health.Total)
	}

	if _, err := s.repo.closeGaps(ctx, staleSeconds); err != nil {
		return err
	}
	if _, err := s.repo.openGaps(ctx, staleSeconds); err != nil {
		return err
	}
	return nil
}

func (s *Service) StartSweeper(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.Sweep(ctx); err != nil && s.log != nil {
				s.log.Error("agent sweep failed", "error", err)
			}
		}
	}
}
