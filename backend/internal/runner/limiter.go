package runner

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"
)

// ErrBusy means the node is at capacity: either the wait-queue is full, or a
// request waited its full budget without a slot freeing up. Callers should map
// this to HTTP 503 and let the client retry.
var ErrBusy = errors.New("runner is busy")

// limiter hands out isolate box IDs, which doubles as the cap on how much
// untrusted code runs at once. Two bounds work together: `boxes` holds one ID
// per concurrently-runnable sandbox (sized to the node's CPUs, since each run
// reserves ~1 CPU), and `admit` caps the total in-flight (running + waiting) so
// a deadline burst can't pile up an unbounded backlog of goroutines. Excess
// over both is rejected immediately.
//
// Unlike the previous Docker model there is no "limiting disabled" mode: a box
// ID is a finite resource the host provisions ahead of time (isolate's
// num_boxes), so unbounded concurrency isn't representable.
// Slot represents a dedicated isolate box and its associated CPU core.
type Slot struct {
	BoxID int
	Core  int
}

// limiter manages isolate box IDs and CPU core allocation, providing a two-tier
// admission pool for interactive runs and batch submissions.
type limiter struct {
	free      chan Slot
	submitCap chan struct{}
	admit     chan struct{}
	maxWait   time.Duration
}

func parseCPUList(cpuList string, maxConcurrent int) []int {
	var cores []int
	cpuList = strings.TrimSpace(cpuList)
	if cpuList != "" {
		parts := strings.Split(cpuList, ",")
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if strings.Contains(part, "-") {
				rangeParts := strings.Split(part, "-")
				if len(rangeParts) == 2 {
					start, err1 := strconv.Atoi(strings.TrimSpace(rangeParts[0]))
					end, err2 := strconv.Atoi(strings.TrimSpace(rangeParts[1]))
					if err1 == nil && err2 == nil && start <= end {
						for i := start; i <= end; i++ {
							cores = append(cores, i)
						}
					}
				}
			} else if c, err := strconv.Atoi(part); err == nil {
				cores = append(cores, c)
			}
		}
	}

	if len(cores) == 0 {
		for i := 0; i < maxConcurrent; i++ {
			cores = append(cores, i)
		}
	}
	return cores
}

func newLimiter(maxConcurrent, maxQueue int, maxWait time.Duration, runReserve int, cpuList string) *limiter {
	if maxQueue < 0 {
		maxQueue = 0
	}
	if runReserve < 0 {
		runReserve = 0
	}
	if runReserve >= maxConcurrent {
		runReserve = maxConcurrent - 1
	}

	submitCapacity := maxConcurrent - runReserve
	if submitCapacity < 1 {
		submitCapacity = 1
	}

	l := &limiter{
		free:      make(chan Slot, maxConcurrent),
		submitCap: make(chan struct{}, submitCapacity),
		admit:     make(chan struct{}, maxConcurrent+maxQueue),
		maxWait:   maxWait,
	}

	cores := parseCPUList(cpuList, maxConcurrent)
	for id := 0; id < maxConcurrent; id++ {
		l.free <- Slot{
			BoxID: id,
			Core:  cores[id%len(cores)],
		}
	}
	return l
}

func (l *limiter) acquireRun(ctx context.Context) (Slot, func(), error) {
	select {
	case l.admit <- struct{}{}:
	default:
		return Slot{}, nil, ErrBusy
	}

	waitCtx, cancel := l.createWaitContext(ctx)
	defer cancel()

	select {
	case slot := <-l.free:
		return slot, func() {
			l.free <- slot
			<-l.admit
		}, nil
	case <-waitCtx.Done():
		<-l.admit
		if ctx.Err() != nil {
			return Slot{}, nil, ctx.Err()
		}
		return Slot{}, nil, ErrBusy
	}
}

func (l *limiter) acquireSubmit(ctx context.Context) (Slot, func(), error) {
	select {
	case l.admit <- struct{}{}:
	default:
		return Slot{}, nil, ErrBusy
	}

	waitCtx, cancel := l.createWaitContext(ctx)
	defer cancel()

	select {
	case l.submitCap <- struct{}{}:
	case <-waitCtx.Done():
		<-l.admit
		if ctx.Err() != nil {
			return Slot{}, nil, ctx.Err()
		}
		return Slot{}, nil, ErrBusy
	}

	select {
	case slot := <-l.free:
		return slot, func() {
			l.free <- slot
			<-l.submitCap
			<-l.admit
		}, nil
	case <-waitCtx.Done():
		<-l.submitCap
		<-l.admit
		if ctx.Err() != nil {
			return Slot{}, nil, ctx.Err()
		}
		return Slot{}, nil, ErrBusy
	}
}

func (l *limiter) acquire(ctx context.Context) (int, func(), error) {
	slot, release, err := l.acquireRun(ctx)
	if err != nil {
		return 0, nil, err
	}
	return slot.BoxID, release, nil
}

func (l *limiter) createWaitContext(ctx context.Context) (context.Context, context.CancelFunc) {
	if l.maxWait > 0 {
		return context.WithTimeout(ctx, l.maxWait)
	}
	return context.WithCancel(ctx)
}

type LimiterStats struct {
	ActiveBoxes   int
	TotalCapacity int
	InFlight      int
	WaitingQueue  int
}

func (l *limiter) stats() LimiterStats {
	if l == nil {
		return LimiterStats{}
	}
	capBoxes := cap(l.free)
	freeBoxes := len(l.free)
	activeBoxes := capBoxes - freeBoxes
	if activeBoxes < 0 {
		activeBoxes = 0
	}
	inFlight := len(l.admit)
	waiting := inFlight - activeBoxes
	if waiting < 0 {
		waiting = 0
	}
	return LimiterStats{
		ActiveBoxes:   activeBoxes,
		TotalCapacity: capBoxes,
		InFlight:      inFlight,
		WaitingQueue:  waiting,
	}
}
