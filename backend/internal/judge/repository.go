package judge

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// HasActiveSubmission checks if a team already has a submission queued or running for a given problem.
func (r *Repository) HasActiveSubmission(ctx context.Context, teamID, problemID string) (bool, error) {
	query := `
		SELECT EXISTS (
			SELECT 1 FROM submissions
			WHERE team_id = $1 AND problem_id = $2 
			  AND (state = 'queued' OR (state = 'running' AND (lease_until IS NULL OR lease_until >= NOW())))
		);
	`
	var active bool
	err := r.pool.QueryRow(ctx, query, teamID, problemID).Scan(&active)
	if err != nil {
		return false, fmt.Errorf("check active submission: %w", err)
	}
	return active, nil
}

// CreateSubmission validates problem parameters, guards against active submissions, and inserts a new submission into the queue.
func (r *Repository) CreateSubmission(ctx context.Context, s Submission) (*Submission, error) {
	// Guard against concurrent active submissions for the same team/problem
	active, err := r.HasActiveSubmission(ctx, s.TeamID, s.ProblemID)
	if err != nil {
		return nil, err
	}
	if active {
		return nil, ErrActiveSubmissionExists
	}

	// The judge awards the sum of the test points, so that is the reachable
	// max, not the problem's declared max_score.
	var declaredMax, pointsTotal, testsTotal int
	err = r.pool.QueryRow(ctx, `
		SELECT p.max_score,
		       COALESCE((SELECT SUM(points) FROM problem_tests WHERE problem_id = p.id), 0)::INT,
		       (SELECT COUNT(*) FROM problem_tests WHERE problem_id = p.id)::INT
		FROM problems p
		WHERE p.id = $1;
	`, s.ProblemID).Scan(&declaredMax, &pointsTotal, &testsTotal)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProblemNotFound
		}
		return nil, fmt.Errorf("fetch problem metadata: %w", err)
	}

	// Rejected before recording, so no attempt is charged for a misconfiguration.
	if testsTotal == 0 {
		return nil, ErrNoTestCases
	}

	maxScore := pointsTotal
	if maxScore <= 0 {
		maxScore = declaredMax
	}

	s.State = StatusQueued
	s.MaxScore = maxScore
	s.TestsTotal = testsTotal
	s.CreatedAt = time.Now().UTC()

	query := `
		INSERT INTO submissions (id, team_id, user_id, problem_id, language, code, state, max_score, tests_total, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING created_at;
	`
	err = r.pool.QueryRow(ctx, query,
		s.ID, s.TeamID, s.UserID, s.ProblemID, s.Language, s.Code, s.State, s.MaxScore, s.TestsTotal, s.CreatedAt,
	).Scan(&s.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert submission: %w", err)
	}

	// Calculate initial queue position
	var pos int
	if err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM submissions
		WHERE state = 'queued' AND created_at <= $1;
	`, s.CreatedAt).Scan(&pos); err != nil {
		pos = 1
	}
	s.QueuePosition = pos

	return &s, nil
}

// GetSubmission fetches a submission by ID along with test case details and live queue position if queued.
func (r *Repository) GetSubmission(ctx context.Context, id string) (*Result, bool, error) {
	query := `
		SELECT id, user_id, team_id, problem_id, state, verdict, score, max_score, tests_total, tests_done, compile_error, created_at, finished_at,
		       review_status, review_reason, reviewed_at
		FROM submissions
		WHERE id = $1;
	`
	var res Result
	var stateStr, reviewStatus string
	var verdict, compileErr *string
	var finishedAt, reviewedAt *time.Time

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&res.SubmissionID, &res.UserID, &res.TeamID, &res.ProblemID, &stateStr, &verdict,
		&res.Score, &res.MaxScore, &res.TestsTotal, &res.TestsDone,
		&compileErr, &res.CreatedAt, &finishedAt,
		&reviewStatus, &res.ReviewReason, &reviewedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("get submission: %w", err)
	}

	res.Status = Status(stateStr)
	res.Verdict = verdict
	res.CompileError = compileErr
	res.FinishedAt = finishedAt
	res.ReviewStatus = ReviewStatus(reviewStatus)
	res.ReviewedAt = reviewedAt

	if res.Status == StatusQueued {
		var pos int
		if err := r.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM submissions
			WHERE state = 'queued' AND created_at <= $1;
		`, res.CreatedAt).Scan(&pos); err != nil {
			pos = 1
		}
		res.QueuePosition = pos
	}

	// Fetch submission test results if available
	rows, err := r.pool.Query(ctx, `
		SELECT submission_id, ordinal, verdict, time_ms, memory_kb, points
		FROM submission_tests
		WHERE submission_id = $1
		ORDER BY ordinal ASC;
	`, id)
	if err == nil {
		defer rows.Close()
		var tests []SubmissionTest
		for rows.Next() {
			var t SubmissionTest
			if err := rows.Scan(&t.SubmissionID, &t.Ordinal, &t.Verdict, &t.TimeMS, &t.MemoryKB, &t.Points); err == nil {
				tests = append(tests, t)
			}
		}
		res.Tests = tests
	}

	return &res, true, nil
}

// ClaimNextSubmission pulls the next submission using weighted fair queueing (FOR UPDATE SKIP LOCKED).
func (r *Repository) ClaimNextSubmission(ctx context.Context, workerID string) (*Submission, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	query := `
		WITH team_counts AS (
			SELECT team_id, COUNT(*) AS pending_count
			FROM submissions
			WHERE state IN ('queued', 'running')
			GROUP BY team_id
		)
		SELECT s.id, s.team_id, s.user_id, s.problem_id, s.language, s.code, s.max_score, s.tests_total, s.created_at,
		       p.time_limit_ms, p.memory_limit_mb
		FROM submissions s
		JOIN team_counts tc ON s.team_id = tc.team_id
		JOIN problems p ON p.id = s.problem_id
		WHERE s.state = 'queued'
		ORDER BY (
			(tc.pending_count - 1) * 10 - EXTRACT(EPOCH FROM (NOW() - s.created_at))
		) ASC
		FOR UPDATE OF s SKIP LOCKED
		LIMIT 1;
	`

	var s Submission
	err = tx.QueryRow(ctx, query).Scan(
		&s.ID, &s.TeamID, &s.UserID, &s.ProblemID, &s.Language, &s.Code, &s.MaxScore, &s.TestsTotal, &s.CreatedAt,
		&s.TimeLimitMS, &s.MemoryLimitMB,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNoQueuedSubmission
		}
		return nil, fmt.Errorf("claim submission: %w", err)
	}

	leaseUntil := time.Now().Add(LeaseDuration)
	_, err = tx.Exec(ctx, `
		UPDATE submissions
		SET state = 'running', claimed_at = NOW(), claimed_by = $1, lease_until = $2
		WHERE id = $3;
	`, workerID, leaseUntil, s.ID)
	if err != nil {
		return nil, fmt.Errorf("update claimed submission: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	s.State = StatusRunning
	return &s, nil
}

// LeaseDuration is how long a claim stays valid before the reaper treats the
// worker as dead. Longer runs must renew.
const LeaseDuration = 60 * time.Second

// RenewLease is scoped to claimed_by so a worker that lost its claim cannot
// resurrect it and race the worker that picked the submission up.
func (r *Repository) RenewLease(ctx context.Context, submissionID, workerID string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE submissions
		SET lease_until = $1
		WHERE id = $2 AND claimed_by = $3 AND state = 'running';
	`, time.Now().Add(LeaseDuration), submissionID, workerID)
	if err != nil {
		return fmt.Errorf("renew lease: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrLeaseLost
	}
	return nil
}

// CompleteSubmission updates a submission with final status, score, tests, and updates team problem scores.
func (r *Repository) CompleteSubmission(ctx context.Context, res Result, workerID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	now := time.Now().UTC()
	stateStr := string(res.Status)

	// max_score is rewritten from what the judge totalled, so a test set edited
	// between submit and judge cannot leave a denominator the run never used.
	// Scoped to claimed_by: if the reaper reassigned this submission mid-run,
	// the worker that lost it must not overwrite the winner's result.
	tag, err := tx.Exec(ctx, `
		UPDATE submissions
		SET state = $1, verdict = $2, score = $3, tests_done = $4, compile_error = $5, finished_at = $6,
		    max_score = CASE WHEN $8 > 0 THEN $8 ELSE max_score END
		WHERE id = $7 AND ($9 = '' OR claimed_by = $9);
	`, stateStr, res.Verdict, res.Score, res.TestsDone, res.CompileError, now, res.SubmissionID, res.MaxScore, workerID)
	if err != nil {
		return fmt.Errorf("update submission state: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrLeaseLost
	}

	// Insert individual test results if provided
	for _, t := range res.Tests {
		_, err = tx.Exec(ctx, `
			INSERT INTO submission_tests (submission_id, ordinal, verdict, time_ms, memory_kb, points)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (submission_id, ordinal) DO UPDATE
			SET verdict = EXCLUDED.verdict, time_ms = EXCLUDED.time_ms, memory_kb = EXCLUDED.memory_kb, points = EXCLUDED.points;
		`, res.SubmissionID, t.Ordinal, t.Verdict, t.TimeMS, t.MemoryKB, t.Points)
		if err != nil {
			return fmt.Errorf("insert submission test: %w", err)
		}
	}

	var teamID string
	err = tx.QueryRow(ctx, `SELECT team_id FROM submissions WHERE id = $1;`, res.SubmissionID).Scan(&teamID)
	if err == nil && teamID != "" {
		if err := recomputeProblemScore(ctx, tx, teamID, res.ProblemID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

type scoreWriter interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func recomputeProblemScore(ctx context.Context, w scoreWriter, teamID, problemID string) error {
	if _, err := w.Exec(ctx, `
		DELETE FROM problem_scores ps
		WHERE ps.team_id = $1 AND ps.problem_id = $2;
	`, teamID, problemID); err != nil {
		return fmt.Errorf("clear problem score: %w", err)
	}

	if _, err := w.Exec(ctx, `
		INSERT INTO problem_scores (team_id, problem_id, user_id, best_score, best_submission_id, updated_at)
		SELECT s.team_id, s.problem_id, s.user_id,
		       CASE WHEN s.review_status = 'accepted' THEN s.score ELSE 0 END,
		       CASE WHEN s.review_status = 'accepted' THEN s.id ELSE NULL END,
		       s.finished_at
		FROM submissions s
		WHERE s.team_id = $1 AND s.problem_id = $2
		  AND s.finished_at IS NOT NULL
		ORDER BY (s.review_status = 'accepted') DESC, s.score DESC, s.finished_at ASC
		LIMIT 1;
	`, teamID, problemID); err != nil {
		return fmt.Errorf("recompute problem score: %w", err)
	}
	return nil
}

// ReviewSubmission records an organizer's accept/reject and rebuilds the affected
// team score. Returns the submission's team and problem so the caller can say what
// moved.
func (r *Repository) ReviewSubmission(ctx context.Context, submissionID, reviewerID string, status ReviewStatus, reason string) (*AdminSubmissionItem, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var teamID, problemID, previous string
	// Locked for the length of the review: two organizers reaching the same
	// submission at once must not each recompute from the other's half-written state.
	err = tx.QueryRow(ctx, `
		SELECT team_id, problem_id, review_status
		FROM submissions
		WHERE id = $1
		FOR UPDATE;
	`, submissionID).Scan(&teamID, &problemID, &previous)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSubmissionNotFound
		}
		return nil, fmt.Errorf("load submission for review: %w", err)
	}

	now := time.Now().UTC()
	if _, err := tx.Exec(ctx, `
		UPDATE submissions
		SET review_status = $2, review_reason = $3, reviewed_by = NULLIF($4, '')::uuid, reviewed_at = $5
		WHERE id = $1;
	`, submissionID, string(status), reason, reviewerID, now); err != nil {
		return nil, fmt.Errorf("update submission review: %w", err)
	}

	if previous != string(status) {
		if _, err := tx.Exec(ctx, `
			INSERT INTO submission_reviews (submission_id, reviewer_id, from_status, to_status, reason)
			VALUES ($1, NULLIF($2, '')::uuid, $3, $4, $5);
		`, submissionID, reviewerID, previous, string(status), reason); err != nil {
			return nil, fmt.Errorf("record submission review: %w", err)
		}
	}

	if err := recomputeProblemScore(ctx, tx, teamID, problemID); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit submission review: %w", err)
	}

	return r.GetAdminSubmission(ctx, submissionID)
}

// GetAdminSubmission is the single-row form of the admin listing, so a review
// response and the table it refreshes describe a submission the same way.
func (r *Repository) GetAdminSubmission(ctx context.Context, id string) (*AdminSubmissionItem, error) {
	list, _, err := r.listSubmissions(ctx, "WHERE s.id = $1", []interface{}{id}, 2, "", "", 1, 0)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, ErrSubmissionNotFound
	}
	return &list[0], nil
}

// ListAdminSubmissions lists submissions joining users, teams, and problems for
// admin monitoring. An omitted filter means no filter, so contestant listings must
// use ListOwnSubmissions instead.
func (r *Repository) ListAdminSubmissions(ctx context.Context, statusFilter, problemID, teamID string, limit, offset int) ([]AdminSubmissionItem, int, error) {
	whereClause := "WHERE 1=1"
	args := []interface{}{}
	argID := 1

	if teamID != "" {
		whereClause += fmt.Sprintf(" AND s.team_id = $%d", argID)
		args = append(args, teamID)
		argID++
	}

	return r.listSubmissions(ctx, whereClause, args, argID, statusFilter, problemID, limit, offset)
}

// ListOwnSubmissions lists what one contestant may see: their team's submissions
// where they have a team, their own where they do not. The owner predicate is built
// here rather than passed in, so it can never be empty.
func (r *Repository) ListOwnSubmissions(ctx context.Context, statusFilter, problemID, userID, teamID string, limit, offset int) ([]AdminSubmissionItem, int, error) {
	if userID == "" {
		return nil, 0, fmt.Errorf("list own submissions: no user")
	}

	args := []interface{}{userID}
	argID := 2

	// Parenthesised: the caller's filters are appended with AND, so an unbracketed
	// OR would let `state = 'passed'` widen the set and return other teams' rows.
	ownerClause := "WHERE s.user_id = $1"
	if teamID != "" {
		ownerClause = fmt.Sprintf("WHERE (s.user_id = $1 OR s.team_id = $%d)", argID)
		args = append(args, teamID)
		argID++
	}

	return r.listSubmissions(ctx, ownerClause, args, argID, statusFilter, problemID, limit, offset)
}

func (r *Repository) listSubmissions(
	ctx context.Context,
	whereClause string,
	args []interface{},
	argID int,
	statusFilter, problemID string,
	limit, offset int,
) ([]AdminSubmissionItem, int, error) {
	if limit <= 0 {
		limit = 50
	}

	if statusFilter != "" {
		whereClause += fmt.Sprintf(" AND s.state = $%d", argID)
		args = append(args, statusFilter)
		argID++
	}
	if problemID != "" {
		whereClause += fmt.Sprintf(" AND s.problem_id = $%d", argID)
		args = append(args, problemID)
		argID++
	}

	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM submissions s %s;`, whereClause)
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count admin submissions: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT s.id, s.user_id, s.team_id, s.problem_id, s.language, s.code, s.state, s.verdict, s.score, s.max_score,
		       s.tests_total, s.tests_done, s.compile_error, s.created_at, s.finished_at,
		       COALESCE(u.display_name, u.username, '') AS user_name,
		       '' AS user_email,
		       COALESCE(t.name, '') AS team_name,
		       COALESCE(p.title, '') AS problem_title,
		       s.review_status, s.review_reason, s.reviewed_at,
		       COALESCE(rv.display_name, rv.username, '') AS reviewed_by
		FROM submissions s
		LEFT JOIN users u ON s.user_id = u.id
		LEFT JOIN teams t ON s.team_id = t.id
		LEFT JOIN problems p ON s.problem_id = p.id
		LEFT JOIN users rv ON s.reviewed_by = rv.id
		%s
		ORDER BY s.created_at DESC
		LIMIT $%d OFFSET $%d;
	`, whereClause, argID, argID+1)

	args = append(args, limit, offset)
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("query admin submissions: %w", err)
	}
	defer rows.Close()

	var list []AdminSubmissionItem
	for rows.Next() {
		var item AdminSubmissionItem
		var stateStr, reviewStatus string
		var verdict, compileErr *string
		var finishedAt, reviewedAt *time.Time

		err := rows.Scan(
			&item.SubmissionID, &item.UserID, &item.TeamID, &item.ProblemID, &item.Language, &item.Code,
			&stateStr, &verdict, &item.Score, &item.MaxScore, &item.TestsTotal, &item.TestsDone,
			&compileErr, &item.CreatedAt, &finishedAt,
			&item.UserName, &item.UserEmail, &item.TeamName, &item.ProblemTitle,
			&reviewStatus, &item.ReviewReason, &reviewedAt, &item.ReviewedBy,
		)
		if err == nil {
			item.Status = Status(stateStr)
			item.Verdict = verdict
			item.CompileError = compileErr
			item.FinishedAt = finishedAt
			item.ReviewStatus = ReviewStatus(reviewStatus)
			item.ReviewedAt = reviewedAt
			list = append(list, item)
		}
	}

	return list, total, nil
}

// RejudgeSubmission resets submission to queued state for re-evaluation.
func (r *Repository) RejudgeSubmission(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE submissions
		SET state = 'queued', verdict = NULL, score = 0, tests_done = 0, compile_error = NULL,
		    claimed_at = NULL, claimed_by = NULL, lease_until = NULL, finished_at = NULL,
		    attempts = 0
		WHERE id = $1;
	`, id)
	return err
}

// CancelSubmission marks a stuck submission as failed.
func (r *Repository) CancelSubmission(ctx context.Context, id string) error {
	verdict := "IE"
	now := time.Now().UTC()
	_, err := r.pool.Exec(ctx, `
		UPDATE submissions
		SET state = 'failed', verdict = $2, finished_at = $3,
		    claimed_at = NULL, claimed_by = NULL, lease_until = NULL
		WHERE id = $1;
	`, id, verdict, now)
	return err
}

// UnstickTeamSubmissions cancels all pending queued/running submissions for a team to release 409 active locks.
func (r *Repository) UnstickTeamSubmissions(ctx context.Context, teamID string) error {
	verdict := "IE"
	now := time.Now().UTC()
	_, err := r.pool.Exec(ctx, `
		UPDATE submissions
		SET state = 'failed', verdict = $1, finished_at = $2
		WHERE team_id = $3 AND state IN ('queued', 'running');
	`, verdict, now, teamID)
	return err
}

// GetProblemTests fetches all test cases stored in DB for a given problem ID.
func (r *Repository) GetProblemTests(ctx context.Context, problemID string) ([]TestCase, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, ordinal, input, expected, points
		FROM problem_tests
		WHERE problem_id = $1
		ORDER BY ordinal ASC;
	`, problemID)
	if err != nil {
		return nil, fmt.Errorf("query problem tests: %w", err)
	}
	defer rows.Close()

	var tests []TestCase
	for rows.Next() {
		var t TestCase
		if err := rows.Scan(&t.ID, &t.Ordinal, &t.Input, &t.Expected, &t.Points); err != nil {
			return nil, fmt.Errorf("scan problem test: %w", err)
		}
		tests = append(tests, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read problem tests: %w", err)
	}

	// No fall back to problem_samples: they are published to competitors and
	// score on a different scale than the problem's max_score.
	if len(tests) == 0 {
		return nil, ErrNoTestCases
	}

	return tests, nil
}

// GetTeamProgress queries problem_scores to return team best scores and completion statuses by problem_id.
func (r *Repository) GetTeamProgress(ctx context.Context, teamID string, userID string) (map[string]ProblemProgress, error) {
	query := `
		SELECT ps.problem_id, ps.best_score, COALESCE(p.max_score, 100) AS max_score
		FROM problem_scores ps
		JOIN problems p ON ps.problem_id = p.id
		WHERE (NULLIF($1, '')::uuid IS NOT NULL AND ps.team_id = $1::uuid) OR ps.user_id = $2::uuid;
	`
	rows, err := r.pool.Query(ctx, query, teamID, userID)
	if err != nil {
		return nil, fmt.Errorf("query team progress: %w", err)
	}
	defer rows.Close()

	result := make(map[string]ProblemProgress)
	for rows.Next() {
		var probID string
		var bestScore, maxScore int
		if err := rows.Scan(&probID, &bestScore, &maxScore); err == nil {
			status := "attempted"
			if bestScore >= maxScore && maxScore > 0 {
				status = "solved"
			}
			result[probID] = ProblemProgress{
				ProblemID: probID,
				BestScore: bestScore,
				Status:    status,
			}
		}
	}
	return result, nil
}
