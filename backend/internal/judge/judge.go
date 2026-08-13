package judge

import (
	"context"
	"errors"
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

	wg.Add(1)
	go func() {
		defer wg.Done()
		j.StartLeaseReaper(ctx, 10*time.Second)
	}()

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

	renewCtx, stopRenew := context.WithCancel(ctx)
	defer stopRenew()
	go j.renewLease(renewCtx, s.ID, workerID)

	res := j.evaluate(ctx, *s)

	if err := j.repo.CompleteSubmission(ctx, res); err != nil {
		j.log.Error("failed to complete submission", "submission_id", s.ID, "error", err)
	} else {
		j.broadcaster.Broadcast(res)
	}
}

func (j *Judge) renewLease(ctx context.Context, submissionID, workerID string) {
	ticker := time.NewTicker(LeaseDuration / 3)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			renewCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			err := j.repo.RenewLease(renewCtx, submissionID, workerID)
			cancel()

			if errors.Is(err, ErrLeaseLost) {
				j.log.Warn("lease lost while judging", "submission_id", submissionID, "worker", workerID)
				return
			}
			if err != nil {
				j.log.Error("failed to renew lease", "submission_id", submissionID, "error", err)
			}
		}
	}
}

func submissionLimits(s Submission) runner.Limits {
	var l runner.Limits

	if s.TimeLimitMS > 0 {
		cpu := time.Duration(s.TimeLimitMS) * time.Millisecond
		l.CPUSeconds = cpu.Seconds()

		wall := 3*cpu + 2*time.Second
		if wall < 5*time.Second {
			wall = 5 * time.Second
		}
		l.Wall = wall
	}

	if s.MemoryLimitMB > 0 {
		l.MemoryKB = int64(s.MemoryLimitMB) * 1024
	}

	return l
}

func (j *Judge) evaluate(ctx context.Context, s Submission) Result {
	tests, err := j.repo.GetProblemTests(ctx, s.ProblemID)
	if err != nil {
		j.log.Error("failed to fetch problem tests for evaluation", "problem_id", s.ProblemID, "error", err)
		verdict := "IE"

		msg := "Could not load this problem's test cases. This is a judge-side fault, not a problem with your code -- please notify an organizer."
		if errors.Is(err, ErrNoTestCases) {
			msg = "This problem has no test cases configured. Your submission was not graded -- please notify an organizer."
		}

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
			CompileError: &msg,
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

	normalizeOutput := func(str string) string {
		str = strings.ReplaceAll(str, "\r\n", "\n")
		str = strings.ReplaceAll(str, "\r", "\n")
		lines := strings.Split(str, "\n")
		for j := range lines {
			lines[j] = strings.TrimRight(lines[j], " \t")
		}
		return strings.TrimSpace(strings.Join(lines, "\n"))
	}

	if j.runner != nil {
		batchCases := make([]runner.BatchCase, len(tests))
		for i, t := range tests {
			batchCases[i] = runner.BatchCase{
				Ordinal: t.Ordinal,
				Stdin:   string(t.Input),
			}
		}

		testMap := make(map[int]TestCase, len(tests))
		for _, t := range tests {
			testMap[t.Ordinal] = t
		}

		type gradedCase struct {
			verdict string
			points  int
		}
		graded := make(map[int]gradedCase, len(tests))

		grade := func(cr runner.BatchCaseResult) gradedCase {
			if cr.Verdict != runner.VerdictAC {
				switch cr.Verdict {
				case runner.VerdictTLE:
					return gradedCase{verdict: "TLE"}
				case runner.VerdictCE:
					return gradedCase{verdict: "CE"}
				case runner.VerdictMLE:
					return gradedCase{verdict: "MLE"}
				case runner.VerdictIE:
					// A judge-side failure, not the submission's fault.
					return gradedCase{verdict: "IE"}
				default:
					return gradedCase{verdict: "RTE"}
				}
			}
			t, exists := testMap[cr.Ordinal]
			if exists && normalizeOutput(cr.Stdout) == normalizeOutput(string(t.Expected)) {
				return gradedCase{verdict: "AC", points: t.Points}
			}
			return gradedCase{verdict: "WA"}
		}

		completedCount := 0
		currentScore := 0
		var mu sync.Mutex

		batchReq := runner.BatchRequest{
			Language: s.Language,
			Code:     s.Code,
			Cases:    batchCases,
			Limits:   submissionLimits(s),
			OnCase: func(cr runner.BatchCaseResult) {
				g := grade(cr)

				mu.Lock()
				graded[cr.Ordinal] = g
				completedCount++
				currentScore += g.points
				cnt := completedCount
				sc := currentScore
				mu.Unlock()

				j.broadcaster.Broadcast(Result{
					SubmissionID: s.ID,
					UserID:       s.UserID,
					TeamID:       s.TeamID,
					ProblemID:    s.ProblemID,
					Status:       StatusRunning,
					Score:        sc,
					MaxScore:     maxScore,
					TestsTotal:   len(tests),
					TestsDone:    cnt,
				})
			},
		}

		batchRes, runErr := j.runner.RunBatch(ctx, batchReq)
		if runErr != nil {
			overallVerdict = "RTE"
		} else if batchRes.CompileError != "" {
			overallVerdict = "CE"
			compileErrStr = &batchRes.CompileError
			return Result{
				SubmissionID: s.ID,
				UserID:       s.UserID,
				TeamID:       s.TeamID,
				ProblemID:    s.ProblemID,
				Status:       StatusFailed,
				Verdict:      &overallVerdict,
				Score:        0,
				MaxScore:     maxScore,
				TestsTotal:   len(tests),
				TestsDone:    0,
				CompileError: compileErrStr,
			}
		} else {
			for _, cr := range batchRes.Cases {
				mu.Lock()
				g, ok := graded[cr.Ordinal]
				mu.Unlock()
				if !ok {
					g = grade(cr)
					currentScore += g.points
				}

				testVerdict := g.verdict
				earnedPoints := g.points

				if testVerdict != "AC" && overallVerdict == "AC" {
					overallVerdict = testVerdict
				}

				submissionTests = append(submissionTests, SubmissionTest{
					SubmissionID: s.ID,
					Ordinal:      cr.Ordinal,
					Verdict:      testVerdict,
					TimeMS:       int(cr.TimeMs),
					MemoryKB:     int(cr.MemoryKB),
					Points:       earnedPoints,
				})
			}
			totalScore = currentScore
		}
	} else {
		overallVerdict = "IE"
		errMsg := "Execution runner is unattached"
		compileErrStr = &errMsg
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
