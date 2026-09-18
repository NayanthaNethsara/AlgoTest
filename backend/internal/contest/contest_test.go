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
	freezeStart := now.Add(-10 * time.Minute)

	values := map[string]string{
		"contest.title":             "Championship 2026",
		"contest.status":            StatusRunning,
		"contest.duration_seconds":  "7200",
		"contest.is_frozen":         "true",
		"contest.freeze_start_time": freezeStart.Format(time.RFC3339),
		"contest.start_time":        start.Format(time.RFC3339),
		"contest.end_time":          end.Format(time.RFC3339),
	}

	snap := parseSnapshot(values)
	m := &Manager{}
	m.snapshot.Store(snap)

	state := m.GetState()
	if !state.IsFrozen {
		t.Errorf("contest should be frozen when is_frozen is set to true")
	}
	if state.FreezeStartTime == nil || !state.FreezeStartTime.Equal(freezeStart.Truncate(time.Second)) {
		t.Errorf("expected FreezeStartTime %v, got %v", freezeStart, state.FreezeStartTime)
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

func TestParseSnapshotProctorSettings(t *testing.T) {
	values := map[string]string{
		"contest.title":                    "Championship 2026",
		"proctor.require_fullscreen":       "true",
		"proctor.min_client_version":       "0.2.2",
		"proctor.enforce_binary_hash":      "true",
		"proctor.authorized_binary_hashes": "a1b2c3d4e5f6,1234567890abcdef",
	}

	snap := parseSnapshot(values)
	if !snap.requireFullscreen {
		t.Errorf("expected requireFullscreen true")
	}
	if snap.minClientVersion != "0.2.2" {
		t.Errorf("expected minClientVersion 0.2.2, got %s", snap.minClientVersion)
	}
	if !snap.enforceBinaryHash {
		t.Errorf("expected enforceBinaryHash true")
	}
	if snap.authorizedBinaryHashes != "a1b2c3d4e5f6,1234567890abcdef" {
		t.Errorf("expected authorizedBinaryHashes match, got %s", snap.authorizedBinaryHashes)
	}

	m := &Manager{}
	m.snapshot.Store(snap)
	state := m.GetState()

	if !state.RequireFullscreen {
		t.Errorf("expected state.RequireFullscreen true")
	}
	if state.MinClientVersion != "0.2.2" {
		t.Errorf("expected state.MinClientVersion 0.2.2, got %s", state.MinClientVersion)
	}
	if !state.EnforceBinaryHash {
		t.Errorf("expected state.EnforceBinaryHash true")
	}
	if state.AuthorizedBinaryHashes != "a1b2c3d4e5f6,1234567890abcdef" {
		t.Errorf("expected state.AuthorizedBinaryHashes match, got %s", state.AuthorizedBinaryHashes)
	}
}

