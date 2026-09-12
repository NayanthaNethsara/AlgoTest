package api

import (
	"strings"
	"sync"
	"time"
)

type loginFailureRecord struct {
	consecutiveFailures int
	lockedUntil         time.Time
	lastAttempt         time.Time
}

// LoginAttemptTracker manages temporary account lockouts after consecutive failed attempts.
type LoginAttemptTracker struct {
	mu          sync.Mutex
	records     map[string]*loginFailureRecord
	maxFailures int
	lockout     time.Duration
}

const (
	defaultMaxFailedLogins = 5
	defaultLockoutDuration = 15 * time.Minute
	trackerEvictionPeriod  = 15 * time.Minute
	trackerIdleThreshold   = 30 * time.Minute
)

var loginAttemptTracker = NewLoginAttemptTracker(defaultMaxFailedLogins, defaultLockoutDuration)

// NewLoginAttemptTracker creates a new tracker with a background eviction loop.
func NewLoginAttemptTracker(maxFailures int, lockout time.Duration) *LoginAttemptTracker {
	tracker := &LoginAttemptTracker{
		records:     make(map[string]*loginFailureRecord),
		maxFailures: maxFailures,
		lockout:     lockout,
	}

	go func() {
		for {
			time.Sleep(trackerEvictionPeriod)
			tracker.evictIdle(time.Now())
		}
	}()

	return tracker
}

// IsLocked checks whether the account is currently locked out and returns the remaining duration.
func (t *LoginAttemptTracker) IsLocked(username string) (bool, time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()

	rec, exists := t.records[strings.ToLower(username)]
	if !exists {
		return false, 0
	}

	now := time.Now()
	if now.Before(rec.lockedUntil) {
		return true, rec.lockedUntil.Sub(now)
	}

	return false, 0
}

// RecordFailure increments the failure count and locks the account if threshold is met.
func (t *LoginAttemptTracker) RecordFailure(username string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()

	key := strings.ToLower(username)
	rec, exists := t.records[key]
	if !exists {
		rec = &loginFailureRecord{}
		t.records[key] = rec
	}

	rec.lastAttempt = time.Now()
	rec.consecutiveFailures++

	if rec.consecutiveFailures >= t.maxFailures {
		rec.lockedUntil = time.Now().Add(t.lockout)
		return true
	}

	return false
}

// RecordSuccess clears any failure records for the given username.
func (t *LoginAttemptTracker) RecordSuccess(username string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	delete(t.records, strings.ToLower(username))
}

// Reset clears all failure records (used primarily for test cleanup).
func (t *LoginAttemptTracker) Reset() {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.records = make(map[string]*loginFailureRecord)
}

func (t *LoginAttemptTracker) evictIdle(now time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()

	for key, rec := range t.records {
		if now.Sub(rec.lastAttempt) > trackerIdleThreshold && now.After(rec.lockedUntil) {
			delete(t.records, key)
		}
	}
}
