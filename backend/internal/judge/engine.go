package judge

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
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

func New(pool *pgxpool.Pool, workers int, testCacheBytes int64, log *slog.Logger) *Judge {
	repo := NewRepository(pool)
	return &Judge{
		repo:        repo,
		tests:       newTestCache(testCacheBytes, repo.GetProblemTests),
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
	if j.repo != nil && j.repo.pool != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_, _ = j.repo.pool.Exec(ctx, "SELECT pg_notify('judge_invalidate_tests', $1)", problemID)
		}()
	}
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
	defer metrics.JudgeWorkersActive.Set(0)

	var wg sync.WaitGroup
	listenerReady := make(chan struct{})
	wg.Add(1)
	go func() {
		defer wg.Done()
		j.startSubmissionListener(ctx, listenerReady)
	}()
	select {
	case <-listenerReady:
	case <-ctx.Done():
		wg.Wait()
		return
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		j.StartLeaseReaper(ctx, 10*time.Second)
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
}

func (j *Judge) workerLoop(ctx context.Context, workerID string) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		claimID := workerID + ":" + uuid.NewString()
		sub, err := j.repo.ClaimNextSubmission(ctx, claimID)
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

		j.processSubmission(ctx, sub, claimID)
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

	evalCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	leaseStop := make(chan struct{})
	defer close(leaseStop)
	go j.heartbeatLease(evalCtx, s.ID, workerID, leaseStop, cancel)

	res := j.evaluate(evalCtx, *s)
	if evalCtx.Err() != nil {
		return
	}

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

func (j *Judge) heartbeatLease(ctx context.Context, submissionID, workerID string, stop <-chan struct{}, cancelEvaluation context.CancelFunc) {
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
				cancelEvaluation()
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

func newResult(s Submission, status Status, verdict string) Result {
	return Result{
		SubmissionID: s.ID,
		UserID:       s.UserID,
		TeamID:       s.TeamID,
		ProblemID:    s.ProblemID,
		Status:       status,
		Verdict:      &verdict,
	}
}

func normalizeOutput(str string) string {
	str = strings.ReplaceAll(str, "\r\n", "\n")
	str = strings.ReplaceAll(str, "\r", "\n")
	str = strings.TrimSpace(str)
	if str == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(str))
	lines := strings.Split(str, "\n")
	for i, line := range lines {
		if i > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(strings.TrimRight(line, " \t"))
	}
	return strings.TrimSpace(b.String())
}

func verdictLabel(v runner.Verdict) string {
	switch v {
	case runner.VerdictAC:
		return "AC"
	case runner.VerdictTLE:
		return "TLE"
	case runner.VerdictCE:
		return "CE"
	case runner.VerdictMLE:
		return "MLE"
	case runner.VerdictIE:
		return "IE"
	case runner.VerdictOLE:
		return "OLE"
	default:
		return "RTE"
	}
}

func resolveTestPoints(tests []TestCase, declaredMax int) int {
	maxScore := 0
	hasCustomPoints := false
	for _, t := range tests {
		if t.Points > 0 {
			hasCustomPoints = true
		}
		maxScore += t.Points
	}
	if maxScore == 0 {
		maxScore = declaredMax
		if maxScore == 0 {
			maxScore = 100
		}
	}

	if !hasCustomPoints && len(tests) > 0 {
		base := maxScore / len(tests)
		remainder := maxScore % len(tests)
		for i := range tests {
			tests[i].Points = base
			if i < remainder {
				tests[i].Points++
			}
		}
	}
	return maxScore
}

func submissionStatus(verdict string, totalScore int) Status {
	if verdict != "AC" && totalScore == 0 {
		return StatusFailed
	}
	return StatusPassed
}

func (j *Judge) evaluate(ctx context.Context, s Submission) Result {
	tests, releaseTests, err := j.tests.acquire(ctx, s.ProblemID)
	if err != nil {
		if j.log != nil {
			j.log.Error("failed to fetch problem tests for evaluation", "problem_id", s.ProblemID, "error", err)
		}
		msg := "Could not load this problem's test cases. This is a judge-side fault, not a problem with your code -- please notify an organizer."
		if errors.Is(err, ErrNoTestCases) {
			msg = "This problem has no test cases configured. Your submission was not graded -- please notify an organizer."
		}

		res := newResult(s, StatusFailed, "IE")
		res.MaxScore = s.MaxScore
		res.TestsTotal = s.TestsTotal
		res.CompileError = &msg
		return res
	}
	defer releaseTests()

	if len(tests) == 0 {
		if j.log != nil {
			j.log.Error("no test cases found for problem", "problem_id", s.ProblemID)
		}
		errMsg := "No test cases configured for this problem"
		res := newResult(s, StatusFailed, "IE")
		res.MaxScore = s.MaxScore
		res.CompileError = &errMsg
		return res
	}

	maxScore := resolveTestPoints(tests, s.MaxScore)

	submissionTests := make([]SubmissionTest, 0, len(tests))
	overallVerdict := "AC"
	var compileErrStr *string

	if j.runner != nil {
		batchCases := make([]runner.BatchCase, len(tests))
		for i, t := range tests {
			batchCases[i] = runner.BatchCase{
				Ordinal: t.Ordinal,
				Stdin:   t.Input,
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
				return gradedCase{verdict: verdictLabel(cr.Verdict)}
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
		if batchRes.CompileError != "" {
			sanitized := sanitizeCompileError(batchRes.CompileError)
			res := newResult(s, StatusFailed, "CE")
			res.MaxScore = maxScore
			res.TestsTotal = len(tests)
			res.CompileError = &sanitized
			return res
		}

		runCasesMap := make(map[int]bool, len(batchRes.Cases))
		for _, cr := range batchRes.Cases {
			runCasesMap[cr.Ordinal] = true
			mu.Lock()
			g, ok := graded[cr.Ordinal]
			mu.Unlock()
			if !ok {
				g = grade(cr)
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
				MaxPoints:    testMap[cr.Ordinal].Points,
			})
		}

		if runErr != nil {
			failVerdict := "RTE"
			if errors.Is(runErr, runner.ErrSandboxUnavailable) {
				failVerdict = "IE"
				errMsg := "Sandbox environment is unavailable on the judge host. Please contact an organizer."
				compileErrStr = &errMsg
			} else {
				errMsg := "Execution terminated unexpectedly during testing."
				compileErrStr = &errMsg
			}

			if overallVerdict == "AC" {
				overallVerdict = failVerdict
			}

			for _, t := range tests {
				if !runCasesMap[t.Ordinal] {
					submissionTests = append(submissionTests, SubmissionTest{
						SubmissionID: s.ID,
						Ordinal:      t.Ordinal,
						Verdict:      failVerdict,
						TimeMS:       0,
						MemoryKB:     0,
						Points:       0,
						MaxPoints:    t.Points,
					})
				}
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

	res := newResult(s, submissionStatus(overallVerdict, totalScore), overallVerdict)
	res.Score = totalScore
	res.MaxScore = maxScore
	res.TestsTotal = len(tests)
	res.TestsDone = len(submissionTests)
	res.CompileError = compileErrStr
	res.Tests = submissionTests
	return res
}

func sanitizeCompileError(msg string) string {
	const maxLen = 4096
	if len(msg) <= maxLen {
		return msg
	}
	return msg[:maxLen] + "\n... [compiler output truncated]"
}

func (j *Judge) startSubmissionListener(ctx context.Context, ready chan<- struct{}) {
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

		_, err = conn.Exec(ctx, "LISTEN judge_new_submission; LISTEN judge_invalidate_tests;")
		if err != nil {
			conn.Release()
			if ctx.Err() != nil {
				return
			}
			time.Sleep(2 * time.Second)
			continue
		}

		j.tests.clear()
		if ready != nil {
			close(ready)
			ready = nil
		}
		for {
			notification, err := conn.Conn().WaitForNotification(ctx)
			if err != nil {
				j.tests.clear()
				conn.Release()
				break
			}

			if notification.Channel == "judge_invalidate_tests" {
				if pid := notification.Payload; pid != "" {
					j.tests.invalidate(pid)
				}
			} else {
				j.wakeWorkers()
			}
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
