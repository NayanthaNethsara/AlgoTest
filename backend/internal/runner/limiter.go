package runner

import (
	"context"
	"errors"
	"time"
)

// ErrBusy means the node is at capacity: either the wait-queue is full, or a
// request waited its full budget without a slot freeing up. Callers should map
// this to HTTP 503 and let the client retry.
var ErrBusy = errors.New("runner is busy")

// limiter caps how much untrusted code runs at once on a single node. Two
// bounds work together: `slots` caps concurrently *running* containers (sized
// to the node's CPUs, since each run reserves ~1 CPU), and `admit` caps the
// total in-flight (running + waiting) so a deadline burst can't pile up an
// unbounded backlog of goroutines. Excess over both is rejected immediately.
type limiter struct {
	slots   chan struct{}
	admit   chan struct{}
	maxWait time.Duration
}

func newLimiter(maxConcurrent, maxQueue int, maxWait time.Duration) *limiter {
	if maxConcurrent <= 0 {
		return nil // limiting disabled
	}
	if maxQueue < 0 {
		maxQueue = 0
	}
	return &limiter{
		slots:   make(chan struct{}, maxConcurrent),
		admit:   make(chan struct{}, maxConcurrent+maxQueue),
		maxWait: maxWait,
	}
}

// acquire reserves a run slot, returning a release func. It fails fast with
// ErrBusy when the wait-queue is already full, and gives up with ErrBusy after
// maxWait if no slot frees up. If ctx is cancelled while waiting, ctx.Err() is
// returned instead.
func (l *limiter) acquire(ctx context.Context) (func(), error) {
	if l == nil {
		return func() {}, nil
	}

	// Admission bounds running+waiting; non-blocking so an overflowing burst
	// is rejected instantly instead of spawning a waiter goroutine.
	select {
	case l.admit <- struct{}{}:
	default:
		return nil, ErrBusy
	}

	waitCtx, cancel := context.WithTimeout(ctx, l.maxWait)
	defer cancel()

	select {
	case l.slots <- struct{}{}:
		return func() {
			<-l.slots
			<-l.admit
		}, nil
	case <-waitCtx.Done():
		<-l.admit
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, ErrBusy
	}
}
