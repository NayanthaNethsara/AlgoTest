package judge

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Judge struct {
	repo        *Repository
	broadcaster *Broadcaster
	workers     int
	notify      chan struct{}
	log         *slog.Logger
}

func New(pool *pgxpool.Pool, workers int, log *slog.Logger) *Judge {
	return &Judge{
		repo:        NewRepository(pool),
		broadcaster: NewBroadcaster(),
		workers:     workers,
		notify:      make(chan struct{}, 100),
		log:         log,
	}
}

func (j *Judge) Broadcaster() *Broadcaster {
	return j.broadcaster
}

func (j *Judge) Submit(ctx context.Context, s Submission) (*Submission, error) {
	created, err := j.repo.CreateSubmission(ctx, s)
	if err != nil {
		return nil, err
	}

	j.broadcaster.Broadcast(Result{
		SubmissionID:  created.ID,
		UserID:        created.UserID,
		TeamID:        created.TeamID,
		ProblemID:     created.ProblemID,
		Status:        StatusQueued,
		QueuePosition: created.QueuePosition,
		CreatedAt:     created.CreatedAt,
	})

	select {
	case j.notify <- struct{}{}:
	default:
	}
	return created, nil
}

func (j *Judge) Result(ctx context.Context, id string) (*Result, bool, error) {
	return j.repo.GetSubmission(ctx, id)
}

// Start spawns worker goroutines that pull queued submissions from DB.
func (j *Judge) Start(ctx context.Context) {
	var wg sync.WaitGroup
	for i := 0; i < j.workers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			j.work(ctx, fmt.Sprintf("worker-%d", workerID))
		}(i)
	}
	wg.Wait()
}

func (j *Judge) work(ctx context.Context, workerID string) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-j.notify:
			j.processNext(ctx, workerID)
		case <-ticker.C:
			j.processNext(ctx, workerID)
		}
	}
}

func (j *Judge) processNext(ctx context.Context, workerID string) {
	s, err := j.repo.ClaimNextSubmission(ctx, workerID)
	if err != nil {
		return
	}

	j.log.Info("judging submission", "worker", workerID, "submission_id", s.ID, "problem_id", s.ProblemID)
	
	j.broadcaster.Broadcast(Result{
		SubmissionID: s.ID,
		UserID:       s.UserID,
		TeamID:       s.TeamID,
		ProblemID:    s.ProblemID,
		Status:       StatusRunning,
		TestsTotal:   s.TestsTotal,
		CreatedAt:    s.CreatedAt,
	})

	res := j.evaluate(*s)
	if err := j.repo.CompleteSubmission(ctx, res); err != nil {
		j.log.Error("failed to complete submission", "submission_id", s.ID, "error", err)
	} else {
		j.broadcaster.Broadcast(res)
	}
}

func (j *Judge) evaluate(s Submission) Result {
	verdict := "AC"
	score := s.MaxScore
	if s.MaxScore == 0 {
		score = 100
	}

	return Result{
		SubmissionID: s.ID,
		UserID:       s.UserID,
		TeamID:       s.TeamID,
		ProblemID:    s.ProblemID,
		Status:       StatusPassed,
		Verdict:      &verdict,
		Score:        score,
		MaxScore:     score,
		TestsTotal:   s.TestsTotal,
		TestsDone:    s.TestsTotal,
	}
}
