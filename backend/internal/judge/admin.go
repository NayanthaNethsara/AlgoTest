package judge

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

func (r *Repository) ReviewSubmission(ctx context.Context, submissionID, reviewerID string, status ReviewStatus, reason string) (*AdminSubmissionItem, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var teamID, problemID, previous string
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

func (r *Repository) RejudgeSubmission(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE submissions
		SET state = 'queued', verdict = NULL, score = 0, tests_done = 0, compile_error = NULL,
		    claimed_at = NULL, claimed_by = NULL, lease_until = NULL, finished_at = NULL,
		    attempts = 0
		WHERE id = $1;
	`, id)
	if err == nil {
		go func() {
			nCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_, _ = r.pool.Exec(nCtx, "SELECT pg_notify('judge_new_submission', '')")
		}()
	}
	return err
}

func (r *Repository) RejudgeProblemSubmissions(ctx context.Context, problemID string) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE submissions
		SET state = 'queued', verdict = NULL, score = 0, tests_done = 0, compile_error = NULL,
		    claimed_at = NULL, claimed_by = NULL, lease_until = NULL, finished_at = NULL,
		    attempts = 0
		WHERE problem_id = $1;
	`, problemID)
	if err != nil {
		return 0, fmt.Errorf("rejudge problem submissions: %w", err)
	}
	if tag.RowsAffected() > 0 {
		go func() {
			nCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_, _ = r.pool.Exec(nCtx, "SELECT pg_notify('judge_new_submission', '')")
		}()
	}
	return tag.RowsAffected(), nil
}

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
