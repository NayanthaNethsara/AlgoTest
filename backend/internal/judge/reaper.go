package judge

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

func (r *Repository) ReclaimExpiredLeases(ctx context.Context, log *slog.Logger) (int64, error) {
	// 1. Mark submissions that exceeded 3 attempts as InternalError (IE)
	tag, err := r.pool.Exec(ctx, `
		UPDATE submissions
		SET state = 'failed', verdict = 'IE', finished_at = NOW(),
		    claimed_at = NULL, claimed_by = NULL, lease_until = NULL
		WHERE state = 'running' AND lease_until < NOW() AND attempts >= 3;
	`)
	if err != nil {
		return 0, fmt.Errorf("fail expired submissions: %w", err)
	}
	failedCount := tag.RowsAffected()
	if failedCount > 0 && log != nil {
		log.Warn("reaper marked expired submissions as failed", "count", failedCount)
	}

	// 2. Re-queue expired running submissions with attempts < 3
	tag, err = r.pool.Exec(ctx, `
		UPDATE submissions
		SET state = 'queued', attempts = attempts + 1,
		    claimed_at = NULL, claimed_by = NULL, lease_until = NULL
		WHERE state = 'running' AND lease_until < NOW();
	`)
	if err != nil {
		return 0, fmt.Errorf("requeue expired submissions: %w", err)
	}
	requeuedCount := tag.RowsAffected()
	if requeuedCount > 0 && log != nil {
		log.Info("reaper requeued expired submissions", "count", requeuedCount)
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
