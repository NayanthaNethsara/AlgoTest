package judge

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

func (r *Repository) ReclaimExpiredLeases(ctx context.Context, log *slog.Logger) (int64, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `
		UPDATE submissions
		SET state = 'queued',
		    claimed_at = NULL, claimed_by = NULL, lease_until = NULL
		WHERE state = 'running' AND lease_until < NOW() AND attempts < 3;
	`)
	if err != nil {
		return 0, fmt.Errorf("requeue expired submissions: %w", err)
	}
	requeuedCount := tag.RowsAffected()
	rows, err := tx.Query(ctx, `
		UPDATE submissions
		SET state = 'failed', verdict = 'IE', finished_at = NOW(), score = 0, tests_done = 0, is_rejudge = false,
		    claimed_at = NULL, claimed_by = NULL, lease_until = NULL
		WHERE state = 'running' AND lease_until < NOW() AND attempts >= 3
		RETURNING id, team_id, problem_id;
	`)
	if err != nil {
		return 0, fmt.Errorf("fail expired submissions: %w", err)
	}
	failedCount, err := reconcileSubmissionChanges(ctx, tx, rows)
	if err != nil {
		return 0, err
	}
	if requeuedCount > 0 {
		if _, err := tx.Exec(ctx, "SELECT pg_notify('judge_new_submission', '')"); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	if failedCount > 0 && log != nil {
		log.Warn("reaper marked expired submissions as failed", "count", failedCount)
	}

	if requeuedCount > 0 {
		if log != nil {
			log.Info("reaper requeued expired submissions", "count", requeuedCount)
		}
	}

	return requeuedCount + failedCount, nil
}

func (j *Judge) StartLeaseReaper(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := j.repo.ReclaimExpiredLeases(ctx, j.log); err != nil {
				if j.log != nil {
					j.log.Error("failed to reclaim expired leases", "error", err)
				}
			}
		}
	}
}
