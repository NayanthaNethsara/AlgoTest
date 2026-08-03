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

func (r *Repository) UpsertHeartbeat(ctx context.Context, userID string, teamID *string, request PingRequest, clientIPAddress string) error {
	clientTypeStr := string(request.ClientType)
	if clientTypeStr == "" {
		clientTypeStr = string(ClientTypeDesktop)
	}

	query := `
		INSERT INTO telemetry_heartbeats (
			user_id, team_id, active_window, running_processes, os_info, ip_address, client_type, last_ping_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
		ON CONFLICT (user_id) DO UPDATE SET
			team_id = EXCLUDED.team_id,
			active_window = EXCLUDED.active_window,
			running_processes = EXCLUDED.running_processes,
			os_info = EXCLUDED.os_info,
			ip_address = EXCLUDED.ip_address,
			client_type = EXCLUDED.client_type,
			last_ping_at = now();
	`
	_, err := r.pool.Exec(ctx, query, userID, teamID, request.ActiveWindow, request.RunningProcesses, request.OSInfo, clientIPAddress, clientTypeStr)
	if err != nil {
		return fmt.Errorf("upsert heartbeat: %w", err)
	}
	return nil
}

func (r *Repository) ListAllHeartbeats(ctx context.Context) ([]Heartbeat, error) {
	query := `
		SELECT
			u.id AS user_id,
			u.username,
			u.display_name,
			t.id AS team_id,
			t.name AS team_name,
			COALESCE(th.active_window, '') AS active_window,
			COALESCE(th.running_processes, '{}') AS running_processes,
			COALESCE(th.os_info, '') AS os_info,
			COALESCE(th.ip_address, '') AS ip_address,
			COALESCE(th.client_type, 'DESKTOP') AS client_type,
			th.last_ping_at
		FROM users u
		LEFT JOIN teams t ON u.team_id = t.id
		LEFT JOIN telemetry_heartbeats th ON u.id = th.user_id
		WHERE u.role = 'competitor'
		ORDER BY th.last_ping_at DESC NULLS LAST, u.display_name ASC;
	`

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query heartbeats: %w", err)
	}
	defer rows.Close()

	currentTime := time.Now()
	var heartbeats []Heartbeat

	for rows.Next() {
		var hb Heartbeat
		var lastPingAt *time.Time

		err := rows.Scan(
			&hb.UserID,
			&hb.Username,
			&hb.DisplayName,
			&hb.TeamID,
			&hb.TeamName,
			&hb.ActiveWindow,
			&hb.RunningProcesses,
			&hb.OSInfo,
			&hb.IPAddress,
			&hb.ClientType,
			&lastPingAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan heartbeat: %w", err)
		}

		if lastPingAt != nil {
			hb.LastPingAt = *lastPingAt
			hb.Status = CalculateStatus(hb.LastPingAt, currentTime)
		} else {
			hb.Status = StatusOffline
		}

		if hb.RunningProcesses == nil {
			hb.RunningProcesses = []string{}
		}

		heartbeats = append(heartbeats, hb)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate heartbeats: %w", err)
	}

	return heartbeats, nil
}
