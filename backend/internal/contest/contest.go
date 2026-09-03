package contest

import (
	"errors"
	"strconv"
	"strings"
	"time"
)

var (
	ErrContestAlreadyRunning = errors.New("contest is already running")
	ErrContestPaused         = errors.New("contest is currently paused; resume to continue")
	ErrContestNotRunning     = errors.New("contest is not currently running")
	ErrContestNotPaused      = errors.New("contest is not currently paused")
)

const (
	StatusNotStarted = "NOT_STARTED"
	StatusRunning    = "RUNNING"
	StatusPaused     = "PAUSED"
	StatusEnded      = "ENDED"

	defaultTitle           = "MiniAlgothon 2026"
	defaultDurationSeconds = 7200
	defaultFreezeMinutes   = 30
)

type ContestState struct {
	Title            string     `json:"title"`
	Status           string     `json:"status"`
	StartTime        *time.Time `json:"startTime,omitempty"`
	EndTime          *time.Time `json:"endTime,omitempty"`
	DurationSeconds  int        `json:"durationSeconds"`
	FreezeMinutes    int        `json:"freezeMinutes"`
	FreezeStartTime  *time.Time `json:"freezeStartTime,omitempty"`
	PausedAt         *time.Time `json:"pausedAt,omitempty"`
	RemainingSeconds       int        `json:"remainingSeconds"`
	ElapsedSeconds         int        `json:"elapsedSeconds"`
	IsFrozen               bool       `json:"isFrozen"`
	RequireFullscreen      bool       `json:"requireFullscreen"`
	MinClientVersion       string     `json:"minClientVersion"`
	EnforceBinaryHash      bool       `json:"enforceBinaryHash"`
	AuthorizedBinaryHashes string     `json:"authorizedBinaryHashes"`
	ServerTime             time.Time  `json:"serverTime"`
}

type stateSnapshot struct {
	title                  string
	status                 string
	startTime              *time.Time
	endTime                *time.Time
	durationSeconds        int
	freezeMinutes          int
	isFrozen               bool
	freezeStartTime        *time.Time
	pausedAt               *time.Time
	requireFullscreen      bool
	minClientVersion       string
	enforceBinaryHash      bool
	authorizedBinaryHashes string
}

func parseSnapshot(values map[string]string) *stateSnapshot {
	title := defaultTitle
	if val, ok := values["contest.title"]; ok && strings.TrimSpace(val) != "" {
		title = strings.TrimSpace(val)
	}

	status := StatusNotStarted
	if val, ok := values["contest.status"]; ok {
		trimmed := strings.ToUpper(strings.TrimSpace(val))
		if trimmed == StatusNotStarted || trimmed == StatusRunning || trimmed == StatusPaused || trimmed == StatusEnded {
			status = trimmed
		}
	}

	durSec := defaultDurationSeconds
	if val, ok := values["contest.duration_seconds"]; ok {
		if parsed, err := strconv.Atoi(strings.TrimSpace(val)); err == nil && parsed > 0 {
			durSec = parsed
		}
	}

	freezeMin := defaultFreezeMinutes
	if val, ok := values["contest.freeze_minutes"]; ok {
		if parsed, err := strconv.Atoi(strings.TrimSpace(val)); err == nil && parsed >= 0 {
			freezeMin = parsed
		}
	}

	var startTime *time.Time
	if val, ok := values["contest.start_time"]; ok && strings.TrimSpace(val) != "" {
		if parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(val)); err == nil {
			startTime = &parsed
		}
	}

	var endTime *time.Time
	if val, ok := values["contest.end_time"]; ok && strings.TrimSpace(val) != "" {
		if parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(val)); err == nil {
			endTime = &parsed
		}
	}

	var pausedAt *time.Time
	if val, ok := values["contest.paused_at"]; ok && strings.TrimSpace(val) != "" {
		if parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(val)); err == nil {
			pausedAt = &parsed
		}
	}

	isFrozen := false
	if val, ok := values["contest.is_frozen"]; ok {
		isFrozen = strings.ToLower(strings.TrimSpace(val)) == "true"
	}

	var freezeStartTime *time.Time
	if val, ok := values["contest.freeze_start_time"]; ok && strings.TrimSpace(val) != "" {
		if parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(val)); err == nil {
			freezeStartTime = &parsed
		}
	}

	requireFullscreen := false
	if val, ok := values["proctor.require_fullscreen"]; ok {
		trimmed := strings.ToLower(strings.TrimSpace(val))
		requireFullscreen = trimmed == "true" || trimmed == "1"
	}

	minClientVersion := "0.2.0"
	if val, ok := values["proctor.min_client_version"]; ok && strings.TrimSpace(val) != "" {
		minClientVersion = strings.TrimSpace(val)
	}

	enforceBinaryHash := false
	if val, ok := values["proctor.enforce_binary_hash"]; ok {
		trimmed := strings.ToLower(strings.TrimSpace(val))
		enforceBinaryHash = trimmed == "true" || trimmed == "1"
	}

	authorizedBinaryHashes := ""
	if val, ok := values["proctor.authorized_binary_hashes"]; ok {
		authorizedBinaryHashes = strings.TrimSpace(val)
	}

	return &stateSnapshot{
		title:                  title,
		status:                 status,
		startTime:              startTime,
		endTime:                endTime,
		durationSeconds:        durSec,
		freezeMinutes:          freezeMin,
		isFrozen:               isFrozen,
		freezeStartTime:        freezeStartTime,
		pausedAt:               pausedAt,
		requireFullscreen:      requireFullscreen,
		minClientVersion:       minClientVersion,
		enforceBinaryHash:      enforceBinaryHash,
		authorizedBinaryHashes: authorizedBinaryHashes,
	}
}
