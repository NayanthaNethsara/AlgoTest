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

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/metrics"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
)

type Judge struct {
	repo        *Repository
	tests       *testCache
	broadcaster *Broadcaster
	runner      *runner.Runner
	workers     int
	notify      chan struct{}
	log         *slog.Logger
}

func New(pool *pgxpool.Pool, workers int, log *slog.Logger) *Judge {
	repo := NewRepository(pool)
	return &Judge{
		repo:        repo,
		tests:       newTestCache(repo.GetProblemTests),
		broadcaster: NewBroadcaster(pool, log),
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

func (j *Judge) InvalidateTests(problemID string) {
	j.tests.invalidate(problemID)
}

func (j *Judge) Submit(ctx context.Context, s Submission) (*Submission, error) {
	created, err := j.repo.CreateSubmission(ctx, s)
	if err != nil {
		return nil, err
	}

	metrics.RecordSubmissionQueued()

	j.broadcaster.Broadcast(Result{
		SubmissionID:  created.ID,
		UserID:        created.UserID,
		TeamID:        created.TeamID,
		ProblemID:     created.ProblemID,
		Status:        StatusQueued,
		QueuePosition: created.QueuePosition,
		CreatedAt:     created.CreatedAt,
	})

	j.wakeWorkers()
	return created, nil
}

func (j *Judge) Result(ctx context.Context, id string) (*Result, bool, error) {
	return j.repo.GetSubmission(ctx, id)
}

func (j *Judge) Start(ctx context.Context) {
	metrics.JudgeWorkersActive.Set(float64(j.workers))

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		j.StartLeaseReaper(ctx, 10*time.Second)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		j.startSubmissionListener(ctx)
	}()

	for i := 0; i < j.workers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			j.workerLoop(ctx, fmt.Sprintf("worker-%d", workerID))
		}(i)
	}

	<-ctx.Done()
	wg.Wait()
	metrics.JudgeWorkersActive.Set(0)
}

func (j *Judge) workerLoop(ctx context.Context, workerID string) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		sub, err := j.repo.ClaimNextSubmission(ctx, workerID)
		if err != nil {
			if errors.Is(err, ErrNoQueuedSubmission) {
				select {
				case <-ctx.Done():
					return
				case <-j.notify:
				case <-time.After(1 * time.Second):
				}
				continue
			}
			if j.log != nil {
				j.log.Error("worker failed to claim submission", "worker", workerID, "error", err)
			}
			time.Sleep(500 * time.Millisecond)
			continue
		}

		j.processSubmission(ctx, sub, workerID)
	}
}

func (j *Judge) processSubmission(ctx context.Context, s *Submission, workerID string) {
	j.broadcaster.Broadcast(Result{
		SubmissionID: s.ID,
		UserID:       s.UserID,
		TeamID:       s.TeamID,
		ProblemID:    s.ProblemID,
		Status:       StatusRunning,
		TestsTotal:   s.TestsTotal,
		TestsDone:    0,
	})

	leaseStop := make(chan struct{})
	go j.heartbeatLease(ctx, s.ID, workerID, leaseStop)

	res := j.evaluate(ctx, *s)
	close(leaseStop)

	if err := j.repo.CompleteSubmission(ctx, res, workerID); err != nil {
		if errors.Is(err, ErrLeaseLost) {
			if j.log != nil {
				j.log.Warn("lease lost while completing submission", "submission_id", s.ID, "worker", workerID)
			}
			return
		}
		if j.log != nil {
			j.log.Error("failed to complete submission", "submission_id", s.ID, "error", err)
		}
		return
	}

	if res.Verdict != nil {
		metrics.RecordSubmissionCompleted(s.Language, *res.Verdict, time.Since(s.CreatedAt))
	}

	now := time.Now().UTC()
	res.FinishedAt = &now
	j.broadcaster.Broadcast(res)
}

func (j *Judge) heartbeatLease(ctx context.Context, submissionID, workerID string, stop <-chan struct{}) {
	ticker := time.NewTicker(LeaseDuration / 3)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			renewCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := j.repo.RenewLease(renewCtx, submissionID, workerID)
			cancel()

			if errors.Is(err, ErrLeaseLost) {
				if j.log != nil {
					j.log.Warn("lease lost while judging", "submission_id", submissionID, "worker", workerID)
				}
				return
			}
			if err != nil && j.log != nil {
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
	tests, err := j.tests.get(ctx, s.ProblemID)
	if err != nil {
		if j.log != nil {
			j.log.Error("failed to fetch problem tests for evaluation", "problem_id", s.ProblemID, "error", err)
		}
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
		if j.log != nil {
			j.log.Error("no test cases found for problem", "problem_id", s.ProblemID)
		}
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
		for i := range lines {
			lines[i] = strings.TrimRight(lines[i], " \t")
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
			sanitized := sanitizeCompileError(batchRes.CompileError)
			compileErrStr = &sanitized
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
		}
	} else {
		overallVerdict = "IE"
		errMsg := "Execution runner is unattached"
		compileErrStr = &errMsg
	}

	totalScore := 0
	for _, st := range submissionTests {
		totalScore += st.Points
	}

	finalStatus := StatusPassed
	if overallVerdict != "AC" && totalScore == 0 {
		finalStatus = StatusFailed
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

func sanitizeCompileError(msg string) string {
	const maxLen = 4096
	if len(msg) <= maxLen {
		return msg
	}
	return msg[:maxLen] + "\n... [compiler output truncated]"
}

func (j *Judge) startSubmissionListener(ctx context.Context) {
	pool := j.repo.pool
	if pool == nil {
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		conn, err := pool.Acquire(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			time.Sleep(2 * time.Second)
			continue
		}

		_, err = conn.Exec(ctx, "LISTEN judge_new_submission")
		if err != nil {
			conn.Release()
			if ctx.Err() != nil {
				return
			}
			time.Sleep(2 * time.Second)
			continue
		}

		for {
			_, err := conn.Conn().WaitForNotification(ctx)
			if err != nil {
				conn.Release()
				break
			}

			j.wakeWorkers()
		}
	}
}

func (j *Judge) wakeWorkers() {
	for k := 0; k < j.workers; k++ {
		select {
		case j.notify <- struct{}{}:
		default:
		}
	}
}
