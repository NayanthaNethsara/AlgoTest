package contest

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

type Manager struct {
	repo     *Repository
	log      *slog.Logger
	snapshot atomic.Pointer[stateSnapshot]
}

func NewManager(repo *Repository, log *slog.Logger) *Manager {
	m := &Manager{
		repo: repo,
		log:  log,
	}
	m.snapshot.Store(&stateSnapshot{
		title:           defaultTitle,
		status:          StatusNotStarted,
		durationSeconds: defaultDurationSeconds,
		freezeMinutes:   defaultFreezeMinutes,
	})
	return m
}

func (m *Manager) Reload(ctx context.Context) error {
	if m.repo == nil {
		return nil
	}
	values, err := m.repo.GetSettings(ctx)
	if err != nil {
		return err
	}

	snap := parseSnapshot(values)
	m.snapshot.Store(snap)
	return nil
}

func (m *Manager) StartRefresher(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := m.Reload(ctx); err != nil && m.log != nil {
				m.log.Warn("failed to reload contest state", "error", err)
			}
		}
	}
}

func (m *Manager) GetState() ContestState {
	snap := m.snapshot.Load()
	now := time.Now().UTC()

	effectiveStatus := snap.status
	remainingSec := 0
	elapsedSec := 0
	isFrozen := false

	switch snap.status {
	case StatusNotStarted:
		remainingSec = snap.durationSeconds
		elapsedSec = 0

	case StatusRunning:
		if snap.startTime != nil && snap.endTime != nil {
			if now.After(*snap.endTime) {
				effectiveStatus = StatusEnded
				remainingSec = 0
				elapsedSec = snap.durationSeconds
			} else {
				remaining := snap.endTime.Sub(now).Seconds()
				if remaining < 0 {
					remaining = 0
				}
				remainingSec = int(remaining)

				elapsed := now.Sub(*snap.startTime).Seconds()
				if elapsed < 0 {
					elapsed = 0
				}
				elapsedSec = int(elapsed)

				if snap.freezeMinutes > 0 {
					freezeStart := snap.endTime.Add(-time.Duration(snap.freezeMinutes) * time.Minute)
					if now.After(freezeStart) || now.Equal(freezeStart) {
						isFrozen = true
					}
				}
			}
		} else {
			remainingSec = snap.durationSeconds
		}

	case StatusPaused:
		if snap.startTime != nil && snap.endTime != nil && snap.pausedAt != nil {
			remaining := snap.endTime.Sub(*snap.pausedAt).Seconds()
			if remaining < 0 {
				remaining = 0
			}
			remainingSec = int(remaining)

			elapsed := snap.pausedAt.Sub(*snap.startTime).Seconds()
			if elapsed < 0 {
				elapsed = 0
			}
			elapsedSec = int(elapsed)
		} else {
			remainingSec = snap.durationSeconds
		}

	case StatusEnded:
		remainingSec = 0
		elapsedSec = snap.durationSeconds
	}

	return ContestState{
		Title:            snap.title,
		Status:           effectiveStatus,
		StartTime:        snap.startTime,
		EndTime:          snap.endTime,
		DurationSeconds:  snap.durationSeconds,
		FreezeMinutes:    snap.freezeMinutes,
		PausedAt:         snap.pausedAt,
		RemainingSeconds: remainingSec,
		ElapsedSeconds:   elapsedSec,
		IsFrozen:         isFrozen,
		ServerTime:       now,
	}
}

func (m *Manager) Start(ctx context.Context, durationMinutes int) error {
	snap := m.snapshot.Load()
	if snap.status == StatusRunning {
		return ErrContestAlreadyRunning
	}
	if snap.status == StatusPaused {
		return ErrContestPaused
	}

	durSec := snap.durationSeconds
	if durationMinutes > 0 {
		durSec = durationMinutes * 60
	}

	now := time.Now().UTC()
	endTime := now.Add(time.Duration(durSec) * time.Second)

	updates := map[string]string{
		"contest.status":           StatusRunning,
		"contest.duration_seconds": strconv.Itoa(durSec),
		"contest.start_time":       now.Format(time.RFC3339),
		"contest.end_time":         endTime.Format(time.RFC3339),
		"contest.paused_at":        "",
	}

	if m.repo != nil {
		if err := m.repo.SaveSettings(ctx, updates); err != nil {
			return err
		}
	}
	return m.Reload(ctx)
}

func (m *Manager) Pause(ctx context.Context) error {
	snap := m.snapshot.Load()
	if snap.status != StatusRunning {
		return ErrContestNotRunning
	}

	now := time.Now().UTC()
	updates := map[string]string{
		"contest.status":    StatusPaused,
		"contest.paused_at": now.Format(time.RFC3339),
	}

	if m.repo != nil {
		if err := m.repo.SaveSettings(ctx, updates); err != nil {
			return err
		}
	}
	return m.Reload(ctx)
}

func (m *Manager) Resume(ctx context.Context) error {
	snap := m.snapshot.Load()
	if snap.status != StatusPaused {
		return ErrContestNotPaused
	}

	now := time.Now().UTC()
	var newEndTime time.Time
	if snap.endTime != nil && snap.pausedAt != nil {
		pauseDuration := now.Sub(*snap.pausedAt)
		if pauseDuration < 0 {
			pauseDuration = 0
		}
		newEndTime = snap.endTime.Add(pauseDuration)
	} else if snap.startTime != nil {
		newEndTime = now.Add(time.Duration(snap.durationSeconds) * time.Second)
	} else {
		newEndTime = now.Add(time.Duration(snap.durationSeconds) * time.Second)
	}

	updates := map[string]string{
		"contest.status":    StatusRunning,
		"contest.end_time":  newEndTime.Format(time.RFC3339),
		"contest.paused_at": "",
	}

	if m.repo != nil {
		if err := m.repo.SaveSettings(ctx, updates); err != nil {
			return err
		}
	}
	return m.Reload(ctx)
}

func (m *Manager) Extend(ctx context.Context, minutes int) error {
	if minutes <= 0 {
		return fmt.Errorf("minutes to extend must be positive")
	}

	snap := m.snapshot.Load()
	additionalSec := minutes * 60
	newDurSec := snap.durationSeconds + additionalSec

	now := time.Now().UTC()
	updates := map[string]string{
		"contest.duration_seconds": strconv.Itoa(newDurSec),
	}

	if snap.endTime != nil {
		currentEnd := *snap.endTime
		if now.After(currentEnd) {
			currentEnd = now
		}
		newEnd := currentEnd.Add(time.Duration(additionalSec) * time.Second)
		updates["contest.end_time"] = newEnd.Format(time.RFC3339)
	}

	if snap.status == StatusEnded {
		updates["contest.status"] = StatusRunning
	}

	if m.repo != nil {
		if err := m.repo.SaveSettings(ctx, updates); err != nil {
			return err
		}
	}
	return m.Reload(ctx)
}

func (m *Manager) Reset(ctx context.Context) error {
	updates := map[string]string{
		"contest.status":     StatusNotStarted,
		"contest.start_time": "",
		"contest.end_time":   "",
		"contest.paused_at":  "",
	}

	if m.repo != nil {
		if err := m.repo.SaveSettings(ctx, updates); err != nil {
			return err
		}
	}
	return m.Reload(ctx)
}

func (m *Manager) End(ctx context.Context) error {
	now := time.Now().UTC()
	updates := map[string]string{
		"contest.status":    StatusEnded,
		"contest.end_time":  now.Format(time.RFC3339),
		"contest.paused_at": "",
	}

	if m.repo != nil {
		if err := m.repo.SaveSettings(ctx, updates); err != nil {
			return err
		}
	}
	return m.Reload(ctx)
}

func (m *Manager) UpdateSettings(ctx context.Context, title string, durationMinutes int, freezeMinutes int) error {
	updates := make(map[string]string)

	if trimmed := strings.TrimSpace(title); trimmed != "" {
		updates["contest.title"] = trimmed
	}
	if durationMinutes > 0 {
		updates["contest.duration_seconds"] = strconv.Itoa(durationMinutes * 60)
	}
	if freezeMinutes >= 0 {
		updates["contest.freeze_minutes"] = strconv.Itoa(freezeMinutes)
	}

	if len(updates) == 0 {
		return nil
	}

	if m.repo != nil {
		if err := m.repo.SaveSettings(ctx, updates); err != nil {
			return err
		}
	}
	return m.Reload(ctx)
}
