package judge

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
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
	err = tx.QueryRow(ctx, `
		UPDATE submissions
		SET state = 'running', claimed_at = NOW(), claimed_by = $1, lease_until = $2, attempts = attempts + 1
		WHERE id = $3 RETURNING claimed_at;
	`, workerID, leaseUntil, s.ID).Scan(&s.AttemptStartedAt)
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
		WHERE id = $2 AND claimed_by = $3 AND state = 'running' AND lease_until > NOW();
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
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		err := r.completeSubmissionTx(ctx, res, workerID)
		if err == nil {
			return nil
		}
		if errors.Is(err, ErrLeaseLost) {
			return err
		}
		lastErr = err
		time.Sleep(50 * time.Millisecond)
	}
	return lastErr
}

func (r *Repository) completeSubmissionTx(ctx context.Context, res Result, workerID string) error {
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
		    max_score = CASE WHEN $8 > 0 THEN $8 ELSE max_score END,
		    is_rejudge = false, tests_total = $10
		WHERE id = $7 AND claimed_by = $9 AND state = 'running' AND lease_until > NOW();
	`, stateStr, res.Verdict, res.Score, res.TestsDone, res.CompileError, now, res.SubmissionID, res.MaxScore, workerID, res.TestsTotal)
	if err != nil {
		return fmt.Errorf("update submission state: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrLeaseLost
	}

	_, err = tx.Exec(ctx, `DELETE FROM submission_tests WHERE submission_id = $1;`, res.SubmissionID)
	if err != nil {
		return fmt.Errorf("clear old submission tests: %w", err)
	}

	if len(res.Tests) > 0 {
		batch := &pgx.Batch{}
		insertQuery := `
			INSERT INTO submission_tests (submission_id, ordinal, verdict, time_ms, memory_kb, points, max_points)
			VALUES ($1, $2, $3, $4, $5, $6, $7);
		`
		for _, t := range res.Tests {
			batch.Queue(insertQuery, res.SubmissionID, t.Ordinal, t.Verdict, t.TimeMS, t.MemoryKB, t.Points, t.MaxPoints)
		}
		br := tx.SendBatch(ctx, batch)
		for range res.Tests {
			if _, bErr := br.Exec(); bErr != nil {
				_ = br.Close()
				return fmt.Errorf("insert submission test batch: %w", bErr)
			}
		}
		if err := br.Close(); err != nil {
			return fmt.Errorf("close submission test batch: %w", err)
		}
	}

	var teamID, problemID string
	if err := tx.QueryRow(ctx, `SELECT team_id, problem_id FROM submissions WHERE id = $1;`, res.SubmissionID).Scan(&teamID, &problemID); err != nil {
		return err
	}
	if err := recomputeProblemScore(ctx, tx, teamID, problemID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func recomputeProblemScore(ctx context.Context, tx pgx.Tx, teamID, problemID string) error {
	// A separate statement after the lock sees the previous scorer's commit.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0));`, teamID+"/"+problemID); err != nil {
		return fmt.Errorf("lock problem score: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM problem_scores WHERE team_id = $1 AND problem_id = $2;`, teamID, problemID); err != nil {
		return fmt.Errorf("clear problem score: %w", err)
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO problem_scores (team_id, problem_id, user_id, best_score, best_submission_id, updated_at)
		SELECT s.team_id, s.problem_id, s.user_id, s.score, s.id, s.created_at
		FROM submissions s
		WHERE s.team_id = $1 AND s.problem_id = $2
		  AND s.state = 'passed' AND s.review_status = 'accepted' AND s.finished_at IS NOT NULL
		ORDER BY s.score DESC, s.created_at ASC, s.id ASC
		LIMIT 1;
	`, teamID, problemID)
	if err != nil {
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

func reconcileSubmissionChanges(ctx context.Context, tx pgx.Tx, rows pgx.Rows) (int64, error) {
	var ids []string
	pairs := make(map[string][2]string)
	for rows.Next() {
		var id, teamID, problemID string
		if err := rows.Scan(&id, &teamID, &problemID); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
		pairs[teamID+"/"+problemID] = [2]string{teamID, problemID}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(ids) == 0 {
		return 0, nil
	}
	if _, err := tx.Exec(ctx, `DELETE FROM submission_tests WHERE submission_id = ANY($1::uuid[]);`, ids); err != nil {
		return 0, err
	}
	keys := make([]string, 0, len(pairs))
	for key := range pairs {
		keys = append(keys, key)
	}
	slices.SortFunc(keys, strings.Compare)
	for _, key := range keys {
		pair := pairs[key]
		if err := recomputeProblemScore(ctx, tx, pair[0], pair[1]); err != nil {
			return 0, err
		}
	}
	return int64(len(ids)), nil
}
