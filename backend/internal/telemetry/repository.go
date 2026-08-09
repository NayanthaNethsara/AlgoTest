package telemetry

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

type ListFilter struct {
	// Status accepts ONLINE, STALE, OFFLINE, or GAP for "currently in a blackout".
	Status string
	Query  string
	Limit  int
	Offset int
}

// ListHeartbeats powers the admin Live tab. Filtering and counting happen in SQL
// because the previous version shipped every competitor row with full process
// arrays on a 10s poll and filtered client-side.
func (r *Repository) ListHeartbeats(ctx context.Context, f ListFilter) ([]Heartbeat, int, error) {
	if f.Limit <= 0 || f.Limit > 500 {
		f.Limit = 100
	}

	const statusExpr = `
		CASE
			WHEN th.last_ping_at IS NULL THEN 'OFFLINE'
			WHEN th.last_ping_at >= now() - interval '45 seconds' THEN 'ONLINE'
			WHEN th.last_ping_at >= now() - interval '2 minutes' THEN 'STALE'
			ELSE 'OFFLINE'
		END`

	const clientExpr = `
		CASE
			WHEN th.shell_alive AND th.last_ping_at >= now() - interval '45 seconds' THEN 'DESKTOP'
			WHEN th.web_last_ping_at >= now() - interval '45 seconds' THEN 'WEB'
			ELSE 'NONE'
		END`

	query := `
		SELECT
			u.id, u.username, u.display_name,
			t.id, t.name,
			COALESCE(th.active_window, ''),
			COALESCE(th.os_info, ''),
			COALESCE(th.ip_address, ''),
			COALESCE(th.agent_version, ''),
			COALESCE(th.shell_alive, false),
			COALESCE(th.internet_reachable, false),
			COALESCE(th.running_processes, '{}'),
			` + clientExpr + `,
			th.last_ping_at,
			` + statusExpr + `,
			ag.id IS NOT NULL,
			COALESCE(EXTRACT(EPOCH FROM now() - th.last_ping_at)::int, 0),
			gp.user_id IS NOT NULL,
			gp.started_at,
			COALESCE(ag.stopped_reason, ''),
			COALESCE(risk.score, 0),
			COALESCE(risk.severity, 'LOW'),
			count(*) OVER ()
		FROM users u
		LEFT JOIN teams t ON u.team_id = t.id
		LEFT JOIN telemetry_heartbeats th ON u.id = th.user_id
		LEFT JOIN proctor_agents ag ON ag.user_id = u.id AND ag.revoked_at IS NULL
		LEFT JOIN telemetry_gaps gp ON gp.user_id = u.id AND gp.ended_at IS NULL
		LEFT JOIN proctor_risk risk ON risk.user_id = u.id
		WHERE u.role = 'competitor'
		  AND ($1 = '' OR ` + statusExpr + ` = $1 OR ($1 = 'GAP' AND gp.user_id IS NOT NULL))
		  AND ($2 = '' OR u.username ILIKE '%' || $2 || '%' OR u.display_name ILIKE '%' || $2 || '%')
		ORDER BY th.last_ping_at DESC NULLS LAST, u.display_name ASC
		LIMIT $3 OFFSET $4;
	`

	rows, err := r.pool.Query(ctx, query, f.Status, f.Query, f.Limit, f.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("query heartbeats: %w", err)
	}
	defer rows.Close()

	now := time.Now()
	var heartbeats []Heartbeat
	total := 0

	for rows.Next() {
		var hb Heartbeat
		var lastPingAt *time.Time

		if err := rows.Scan(
			&hb.UserID, &hb.Username, &hb.DisplayName,
			&hb.TeamID, &hb.TeamName,
			&hb.ActiveWindow, &hb.OSInfo, &hb.IPAddress,
			&hb.AgentVersion, &hb.ShellAlive, &hb.InternetReachable,
			&hb.ProcessMatches, &hb.ClientType, &lastPingAt, &hb.Status,
			&hb.Enrolled, &hb.OfflineSeconds, &hb.InGap, &hb.GapStartedAt,
			&hb.StoppedReason, &hb.RiskScore, &hb.Severity, &total,
		); err != nil {
			return nil, 0, fmt.Errorf("scan heartbeat: %w", err)
		}

		if lastPingAt != nil {
			hb.LastPingAt = *lastPingAt
			hb.Status = CalculateStatus(hb.LastPingAt, now)
		}
		if hb.ProcessMatches == nil {
			hb.ProcessMatches = []string{}
		}

		heartbeats = append(heartbeats, hb)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate heartbeats: %w", err)
	}

	return heartbeats, total, nil
}

// UpsertWeb records a browser ping synchronously. Only used when the batcher is
// absent (tests); the live path goes through Batcher.EnqueueWeb.
func (r *Repository) UpsertWeb(ctx context.Context, row WebRow) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO telemetry_heartbeats (user_id, team_id, web_last_ping_at, web_ip, web_user_agent)
		VALUES ($1, (SELECT team_id FROM users WHERE id = $1), now(), $2, $3)
		ON CONFLICT (user_id) DO UPDATE SET
			team_id          = EXCLUDED.team_id,
			web_last_ping_at = now(),
			web_ip           = EXCLUDED.web_ip,
			web_user_agent   = EXCLUDED.web_user_agent;
	`, row.UserID, row.IPAddress, row.UserAgent)
	if err != nil {
		return fmt.Errorf("upsert web ping: %w", err)
	}
	return nil
}
