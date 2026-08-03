package judge

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
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
			WHERE team_id = $1 AND problem_id = $2 AND state IN ('queued', 'running')
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

	// Fetch problem metadata (max_score and number of test cases)
	var maxScore int
	var testsTotal int
	err = r.pool.QueryRow(ctx, `
		SELECT max_score, (SELECT COUNT(*) FROM problem_tests WHERE problem_id = $1)
		FROM problems
		WHERE id = $1;
	`, s.ProblemID).Scan(&maxScore, &testsTotal)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProblemNotFound
		}
		return nil, fmt.Errorf("fetch problem metadata: %w", err)
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
		SELECT id, user_id, team_id, problem_id, state, verdict, score, max_score, tests_total, tests_done, compile_error, created_at, finished_at
		FROM submissions
		WHERE id = $1;
	`
	var res Result
	var stateStr string
	var verdict, compileErr *string
	var finishedAt *time.Time

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&res.SubmissionID, &res.UserID, &res.TeamID, &res.ProblemID, &stateStr, &verdict,
		&res.Score, &res.MaxScore, &res.TestsTotal, &res.TestsDone,
		&compileErr, &res.CreatedAt, &finishedAt,
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
		SELECT s.id, s.team_id, s.user_id, s.problem_id, s.language, s.code, s.max_score, s.tests_total, s.created_at
		FROM submissions s
		JOIN team_counts tc ON s.team_id = tc.team_id
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
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNoQueuedSubmission
		}
		return nil, fmt.Errorf("claim submission: %w", err)
	}

	leaseUntil := time.Now().Add(60 * time.Second)
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

// CompleteSubmission updates a submission with final status, score, tests, and updates team problem scores.
func (r *Repository) CompleteSubmission(ctx context.Context, res Result) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	now := time.Now().UTC()
	stateStr := string(res.Status)

	_, err = tx.Exec(ctx, `
		UPDATE submissions
		SET state = $1, verdict = $2, score = $3, tests_done = $4, compile_error = $5, finished_at = $6
		WHERE id = $7;
	`, stateStr, res.Verdict, res.Score, res.TestsDone, res.CompileError, now, res.SubmissionID)
	if err != nil {
		return fmt.Errorf("update submission state: %w", err)
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

	// Atomically update team's best score for the problem
	var teamID, userID string
	err = tx.QueryRow(ctx, `SELECT team_id, user_id FROM submissions WHERE id = $1;`, res.SubmissionID).Scan(&teamID, &userID)
	if err == nil && teamID != "" {
		_, err = tx.Exec(ctx, `
			INSERT INTO problem_scores (team_id, problem_id, user_id, best_score, best_submission_id, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (team_id, problem_id) DO UPDATE
			SET best_score = GREATEST(problem_scores.best_score, EXCLUDED.best_score),
			    best_submission_id = CASE
			        WHEN EXCLUDED.best_score > problem_scores.best_score THEN EXCLUDED.best_submission_id
			        ELSE problem_scores.best_submission_id
			    END,
			    updated_at = EXCLUDED.updated_at;
		`, teamID, res.ProblemID, userID, res.Score, res.SubmissionID, now)
		if err != nil {
			return fmt.Errorf("update problem scores: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// ListAdminSubmissions lists submissions joining users, teams, and problems for admin monitoring.
func (r *Repository) ListAdminSubmissions(ctx context.Context, statusFilter, problemID, teamID string, limit, offset int) ([]AdminSubmissionItem, int, error) {
	if limit <= 0 {
		limit = 50
	}

	whereClause := "WHERE 1=1"
	args := []interface{}{}
	argID := 1

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
	if teamID != "" {
		whereClause += fmt.Sprintf(" AND s.team_id = $%d", argID)
		args = append(args, teamID)
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
		       COALESCE(u.email, '') AS user_email,
		       COALESCE(t.name, '') AS team_name,
		       COALESCE(p.title, '') AS problem_title
		FROM submissions s
		LEFT JOIN users u ON s.user_id = u.id
		LEFT JOIN teams t ON s.team_id = t.id
		LEFT JOIN problems p ON s.problem_id = p.id
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
		var stateStr string
		var verdict, compileErr *string
		var finishedAt *time.Time

		err := rows.Scan(
			&item.SubmissionID, &item.UserID, &item.TeamID, &item.ProblemID, &item.Language, &item.Code,
			&stateStr, &verdict, &item.Score, &item.MaxScore, &item.TestsTotal, &item.TestsDone,
			&compileErr, &item.CreatedAt, &finishedAt,
			&item.UserName, &item.UserEmail, &item.TeamName, &item.ProblemTitle,
		)
		if err == nil {
			item.Status = Status(stateStr)
			item.Verdict = verdict
			item.CompileError = compileErr
			item.FinishedAt = finishedAt
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
		    claimed_at = NULL, claimed_by = NULL, lease_until = NULL, finished_at = NULL
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
		SET state = 'failed', verdict = $1, finished_at = $2
		WHERE id = $3;
	`, verdict, now, id)
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

// GetProblemTests fetches all test cases stored in DB for a given problem ID, falling back to samples if hidden tests are empty.
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
		return nil, err
	}

	if len(tests) == 0 {
		sampleRows, err := r.pool.Query(ctx, `
			SELECT id, ordinal, input, output
			FROM problem_samples
			WHERE problem_id = $1
			ORDER BY ordinal ASC;
		`, problemID)
		if err == nil {
			defer sampleRows.Close()
			for sampleRows.Next() {
				var sID string
				var ord int
				var inStr, outStr string
				if err := sampleRows.Scan(&sID, &ord, &inStr, &outStr); err == nil {
					tests = append(tests, TestCase{
						ID:       sID,
						Ordinal:  ord,
						Input:    []byte(inStr),
						Expected: []byte(outStr),
						Points:   33,
					})
				}
			}
		}
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

