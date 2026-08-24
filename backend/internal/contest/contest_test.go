package contest

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestParseSnapshotDefaults(t *testing.T) {
	snap := parseSnapshot(map[string]string{})
	if snap.title != defaultTitle {
		t.Errorf("title = %s, want %s", snap.title, defaultTitle)
	}
	if snap.status != StatusNotStarted {
		t.Errorf("status = %s, want %s", snap.status, StatusNotStarted)
	}
	if snap.durationSeconds != defaultDurationSeconds {
		t.Errorf("durationSeconds = %d, want %d", snap.durationSeconds, defaultDurationSeconds)
	}
	if snap.freezeMinutes != defaultFreezeMinutes {
		t.Errorf("freezeMinutes = %d, want %d", snap.freezeMinutes, defaultFreezeMinutes)
	}
}

func TestContestStateCalculations(t *testing.T) {
	now := time.Now().UTC()
	start := now.Add(-30 * time.Minute)
	end := now.Add(90 * time.Minute)

	values := map[string]string{
		"contest.title":            "Championship 2026",
		"contest.status":           StatusRunning,
		"contest.duration_seconds": "7200",
		"contest.freeze_minutes":   "30",
		"contest.start_time":       start.Format(time.RFC3339),
		"contest.end_time":         end.Format(time.RFC3339),
	}

	snap := parseSnapshot(values)
	m := &Manager{}
	m.snapshot.Store(snap)

	state := m.GetState()
	if state.Status != StatusRunning {
		t.Errorf("expected status %s, got %s", StatusRunning, state.Status)
	}
	if state.RemainingSeconds < 5300 || state.RemainingSeconds > 5500 {
		t.Errorf("unexpected remaining seconds: %d", state.RemainingSeconds)
	}
	if state.IsFrozen {
		t.Errorf("contest should not be frozen with 90m remaining")
	}
}

func TestContestFreezeCalculation(t *testing.T) {
	now := time.Now().UTC()
	start := now.Add(-100 * time.Minute)
	end := now.Add(20 * time.Minute)

	values := map[string]string{
		"contest.title":            "Championship 2026",
		"contest.status":           StatusRunning,
		"contest.duration_seconds": "7200",
		"contest.freeze_minutes":   "30",
		"contest.start_time":       start.Format(time.RFC3339),
		"contest.end_time":         end.Format(time.RFC3339),
	}

	snap := parseSnapshot(values)
	m := &Manager{}
	m.snapshot.Store(snap)

	state := m.GetState()
	if !state.IsFrozen {
		t.Errorf("contest should be frozen when remaining time is less than freezeMinutes")
	}
}

func TestContestDynamicEndWhenElapsed(t *testing.T) {
	now := time.Now().UTC()
	start := now.Add(-130 * time.Minute)
	end := now.Add(-10 * time.Minute)

	values := map[string]string{
		"contest.status":           StatusRunning,
		"contest.duration_seconds": "7200",
		"contest.start_time":       start.Format(time.RFC3339),
		"contest.end_time":         end.Format(time.RFC3339),
	}

	snap := parseSnapshot(values)
	m := &Manager{}
	m.snapshot.Store(snap)

	state := m.GetState()
	if state.Status != StatusEnded {
		t.Errorf("expected dynamically computed status %s, got %s", StatusEnded, state.Status)
	}
	if state.RemainingSeconds != 0 {
		t.Errorf("remaining seconds should be 0, got %d", state.RemainingSeconds)
	}
}

func TestStateTransitionGuards(t *testing.T) {
	ctx := context.Background()

	mRunning := &Manager{}
	mRunning.snapshot.Store(&stateSnapshot{status: StatusRunning})
	if err := mRunning.Start(ctx, 60); !errors.Is(err, ErrContestAlreadyRunning) {
		t.Errorf("expected ErrContestAlreadyRunning, got %v", err)
	}
	if err := mRunning.Resume(ctx); !errors.Is(err, ErrContestNotPaused) {
		t.Errorf("expected ErrContestNotPaused, got %v", err)
	}

	mPaused := &Manager{}
	mPaused.snapshot.Store(&stateSnapshot{status: StatusPaused})
	if err := mPaused.Start(ctx, 60); !errors.Is(err, ErrContestPaused) {
		t.Errorf("expected ErrContestPaused, got %v", err)
	}
	if err := mPaused.Pause(ctx); !errors.Is(err, ErrContestNotRunning) {
		t.Errorf("expected ErrContestNotRunning, got %v", err)
	}
}
