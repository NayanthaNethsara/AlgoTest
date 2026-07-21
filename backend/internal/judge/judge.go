package judge

import (
	"context"
	"errors"
	"log/slog"
	"sync"
)

var ErrQueueFull = errors.New("judge queue is full")

type Judge struct {
	queue   chan Submission
	store   *Store
	workers int
	log     *slog.Logger
}

func New(workers, queueSize int, log *slog.Logger) *Judge {
	return &Judge{
		queue:   make(chan Submission, queueSize),
		store:   NewStore(),
		workers: workers,
		log:     log,
	}
}

func (j *Judge) Submit(s Submission) error {
	select {
	case j.queue <- s:
		j.store.Save(Result{SubmissionID: s.ID, Status: StatusQueued})
		return nil
	default:
		return ErrQueueFull
	}
}

func (j *Judge) Result(id string) (Result, bool) {
	return j.store.Get(id)
}

// Start blocks until ctx is cancelled and all workers have drained.
func (j *Judge) Start(ctx context.Context) {
	var wg sync.WaitGroup
	for i := 0; i < j.workers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			j.work(ctx, id)
		}(i)
	}
	wg.Wait()
}

func (j *Judge) work(ctx context.Context, workerID int) {
	for {
		select {
		case <-ctx.Done():
			return
		case s := <-j.queue:
			j.log.Info("judging submission", "worker", workerID, "submission", s.ID)
			j.store.Save(Result{SubmissionID: s.ID, Status: StatusRunning})
			j.store.Save(j.run(s))
		}
	}
}

func (j *Judge) run(s Submission) Result {
	return Result{
		SubmissionID: s.ID,
		Status:       StatusPassed,
		Output:       "no test cases configured",
	}
}
