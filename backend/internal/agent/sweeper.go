package agent

import (
	"context"
	"time"
)

// incidentThresholdNumerator/Denominator: when this fraction of the live fleet
// goes quiet at once, the cause is ours (a restart, a reload, a switch), not
// hundreds of contestants simultaneously killing their agents.
const (
	incidentThresholdNumerator   = 3
	incidentThresholdDenominator = 10
	incidentMinFleet             = 10
)

// Sweep opens and closes telemetry gaps, and suppresses them wholesale during a
// fleet-wide outage. Gaps are the permanent blackout record, so attributing one
// to a contestant when the server was the thing that vanished is the fastest way
// to make organizers stop trusting the review queue.
func (s *Service) Sweep(ctx context.Context) error {
	staleSeconds := s.policy.GateMaxStaleSeconds

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
