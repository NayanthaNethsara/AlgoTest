package judge

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
)

type Judge struct {
	repo        *Repository
	broadcaster *Broadcaster
	runner      *runner.Runner
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

func (j *Judge) SetRunner(rn *runner.Runner) {
	j.runner = rn
}

func (j *Judge) Broadcaster() *Broadcaster {
	return j.broadcaster
}

func (j *Judge) Repo() *Repository {
	return j.repo
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

	res := j.evaluate(ctx, *s)
	if err := j.repo.CompleteSubmission(ctx, res); err != nil {
		j.log.Error("failed to complete submission", "submission_id", s.ID, "error", err)
	} else {
		j.broadcaster.Broadcast(res)
	}
}

func (j *Judge) evaluate(ctx context.Context, s Submission) Result {
	tests, err := j.repo.GetProblemTests(ctx, s.ProblemID)
	if err != nil {
		j.log.Error("failed to fetch problem tests for evaluation", "problem_id", s.ProblemID, "error", err)
		verdict := "IE"
		return Result{
			SubmissionID: s.ID,
			UserID:       s.UserID,
			TeamID:       s.TeamID,
			ProblemID:    s.ProblemID,
			Status:       StatusFailed,
			Verdict:      &verdict,
			Score:        0,
			MaxScore:     s.MaxScore,
			TestsTotal:   s.TestsTotal,
			TestsDone:    0,
		}
	}

	if len(tests) == 0 {
		j.log.Error("no test cases found for problem", "problem_id", s.ProblemID)
		verdict := "IE"
		errMsg := "No test cases configured for this problem"
		return Result{
			SubmissionID: s.ID,
			UserID:       s.UserID,
			TeamID:       s.TeamID,
			ProblemID:    s.ProblemID,
			Status:       StatusFailed,
			Verdict:      &verdict,
			Score:        0,
			MaxScore:     s.MaxScore,
			TestsTotal:   0,
			TestsDone:    0,
			CompileError: &errMsg,
		}
	}

	totalScore := 0
	maxScore := 0
	for _, t := range tests {
		maxScore += t.Points
	}
	if maxScore == 0 {
		maxScore = s.MaxScore
		if maxScore == 0 {
			maxScore = 100
		}
	}

	submissionTests := make([]SubmissionTest, 0, len(tests))
	overallVerdict := "AC"
	var compileErrStr *string

	for i, t := range tests {
		testVerdict := "AC"
		earnedPoints := 0
		var timeMs int
		var memoryKb int

		if j.runner != nil {
			runRes, runErr := j.runner.Run(ctx, runner.Request{
				Language: s.Language,
				Code:     s.Code,
				Stdin:    string(t.Input),
			})

			if runErr != nil {
				testVerdict = "RTE"
			} else {
				timeMs = int(runRes.TimeMs)
				memoryKb = int(runRes.MemoryKB)
				if runRes.CompileError != "" {
					testVerdict = "CE"
					compileErrStr = &runRes.CompileError
				} else if runRes.ExitCode != 0 {
					if runRes.ExitCode == 137 {
						testVerdict = "TLE"
					} else {
						testVerdict = "RTE"
					}
				} else {
					normalizeOutput := func(str string) string {
						str = strings.ReplaceAll(str, "\r\n", "\n")
						str = strings.ReplaceAll(str, "\r", "\n")
						lines := strings.Split(str, "\n")
						for j := range lines {
							lines[j] = strings.TrimRight(lines[j], " \t")
						}
						return strings.TrimSpace(strings.Join(lines, "\n"))
					}

					actualOutput := normalizeOutput(runRes.Stdout)
					expectedOutput := normalizeOutput(string(t.Expected))
					if actualOutput == expectedOutput {
						testVerdict = "AC"
						earnedPoints = t.Points
					} else {
						testVerdict = "WA"
					}
				}
			}
		} else {
			// Fallback when runner is unattached
			testVerdict = "IE"
			earnedPoints = 0
			errMsg := "Execution runner is unattached"
			compileErrStr = &errMsg
		}

		totalScore += earnedPoints

		if testVerdict != "AC" && overallVerdict == "AC" {
			overallVerdict = testVerdict
		}

		submissionTests = append(submissionTests, SubmissionTest{
			SubmissionID: s.ID,
			Ordinal:      t.Ordinal,
			Verdict:      testVerdict,
			TimeMS:       timeMs,
			MemoryKB:     memoryKb,
			Points:       earnedPoints,
		})

		// Broadcast real-time progress update
		j.broadcaster.Broadcast(Result{
			SubmissionID: s.ID,
			UserID:       s.UserID,
			TeamID:       s.TeamID,
			ProblemID:    s.ProblemID,
			Status:       StatusRunning,
			Score:        totalScore,
			MaxScore:     maxScore,
			TestsTotal:   len(tests),
			TestsDone:    i + 1,
		})
	}

	finalStatus := StatusPassed
	if overallVerdict != "AC" && totalScore == 0 {
		finalStatus = StatusFailed
	} else if overallVerdict != "AC" {
		finalStatus = StatusPassed // Partial score earned
	}

	return Result{
		SubmissionID: s.ID,
		UserID:       s.UserID,
		TeamID:       s.TeamID,
		ProblemID:    s.ProblemID,
		Status:       finalStatus,
		Verdict:      &overallVerdict,
		Score:        totalScore,
		MaxScore:     maxScore,
		TestsTotal:   len(tests),
		TestsDone:    len(tests),
		CompileError: compileErrStr,
		Tests:        submissionTests,
	}
}
