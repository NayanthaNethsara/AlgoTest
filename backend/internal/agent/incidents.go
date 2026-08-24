package agent

import (
	"context"
	"fmt"
)

func (r *Repository) openGaps(ctx context.Context, staleSeconds int) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO telemetry_gaps (user_id, agent_id, started_at, reason)
		SELECT a.user_id, a.id, COALESCE(a.last_seen_at, a.enrolled_at), 'agent_unreachable'
		FROM proctor_agents a
		WHERE a.revoked_at IS NULL
		  AND a.stopped_at IS NULL
		  AND COALESCE(a.last_seen_at, a.enrolled_at) < now() - make_interval(secs => $1)
		ON CONFLICT (user_id) WHERE ended_at IS NULL DO NOTHING;
	`, staleSeconds)
	if err != nil {
		return 0, fmt.Errorf("open gaps: %w", err)
	}
	return tag.RowsAffected(), nil
}

func (r *Repository) closeGaps(ctx context.Context, staleSeconds int) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE telemetry_gaps g
		SET ended_at = now(),
		    duration_seconds = GREATEST(1, EXTRACT(EPOCH FROM now() - g.started_at)::int)
		WHERE g.ended_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM proctor_agents a
			WHERE a.user_id = g.user_id
			  AND a.revoked_at IS NULL
			  AND (a.stopped_at IS NOT NULL
			       OR COALESCE(a.last_seen_at, a.enrolled_at) >= now() - make_interval(secs => $1))
		  );
	`, staleSeconds)
	if err != nil {
		return 0, fmt.Errorf("close gaps: %w", err)
	}
	return tag.RowsAffected(), nil
}

func (r *Repository) discardGapsInIncident(ctx context.Context) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM telemetry_gaps g
		WHERE g.ended_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM telemetry_incidents i
			WHERE i.ended_at IS NULL AND g.started_at >= i.started_at - interval '60 seconds'
		  );
	`)
	if err != nil {
		return 0, fmt.Errorf("discard incident gaps: %w", err)
	}
	return tag.RowsAffected(), nil
}

func (r *Repository) openIncident(ctx context.Context, affected, enrolled int) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO telemetry_incidents (started_at, affected_agents, enrolled_agents, note)
		SELECT now(), $1, $2, 'fleet-wide heartbeat loss; contestant gaps suppressed'
		WHERE NOT EXISTS (SELECT 1 FROM telemetry_incidents WHERE ended_at IS NULL);
	`, affected, enrolled)
	if err != nil {
		return false, fmt.Errorf("open incident: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

func (r *Repository) closeIncident(ctx context.Context) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE telemetry_incidents SET ended_at = now() WHERE ended_at IS NULL;
	`)
	if err != nil {
		return false, fmt.Errorf("close incident: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

func (r *Repository) IncidentOpen(ctx context.Context) (bool, error) {
	var open bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM telemetry_incidents WHERE ended_at IS NULL);`).Scan(&open)
	if err != nil {
		return false, fmt.Errorf("check incident: %w", err)
	}
	return open, nil
}
