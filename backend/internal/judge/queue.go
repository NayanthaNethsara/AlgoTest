package judge

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const LeaseDuration = 60 * time.Second

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

func (r *Repository) CompleteSubmission(ctx context.Context, res Result, workerID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	now := time.Now().UTC()
	stateStr := string(res.Status)

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

	if len(tests) == 0 {
		return nil, ErrNoTestCases
	}

	return tests, nil
}
