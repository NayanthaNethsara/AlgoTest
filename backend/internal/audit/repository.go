package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
	log  *slog.Logger
}

func NewRepository(pool *pgxpool.Pool, log *slog.Logger) *Repository {
	return &Repository{
		pool: pool,
		log:  log,
	}
}

// Record inserts a new audit log record.
func (r *Repository) Record(ctx context.Context, entry LogEntry) error {
	detailsJSON, err := json.Marshal(entry.Details)
	if err != nil {
		detailsJSON = []byte("{}")
	}

	query := `
		INSERT INTO audit_logs (
			actor_id, actor_username, actor_role, action, target_type, target_id,
			status, ip_address, user_agent, details
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb);
	`

	_, err = r.pool.Exec(
		ctx,
		query,
		entry.ActorID,
		entry.ActorUsername,
		entry.ActorRole,
		entry.Action,
		entry.TargetType,
		entry.TargetID,
		entry.Status,
		entry.IPAddress,
		entry.UserAgent,
		string(detailsJSON),
	)
	if err != nil {
		if r.log != nil {
			r.log.Error("failed to insert audit log", "action", entry.Action, "error", err)
		}
		return fmt.Errorf("insert audit log: %w", err)
	}

	return nil
}

// RecordAsync writes an audit entry in the background with a standalone context.
func (r *Repository) RecordAsync(entry LogEntry) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = r.Record(ctx, entry)
	}()
}

// List queries audit logs matching the given filter with pagination and total count.
func (r *Repository) List(ctx context.Context, filter FilterOptions) ([]LogEntry, int, error) {
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 500 {
		filter.Limit = 500
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}

	whereClauses := []string{"1=1"}
	args := []any{}
	argIdx := 1

	if strings.TrimSpace(filter.Action) != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("action = $%d", argIdx))
		args = append(args, strings.TrimSpace(filter.Action))
		argIdx++
	}

	if strings.TrimSpace(filter.Status) != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, strings.TrimSpace(filter.Status))
		argIdx++
	}

	if strings.TrimSpace(filter.ActorUsername) != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("actor_username ILIKE $%d", argIdx))
		args = append(args, "%"+strings.TrimSpace(filter.ActorUsername)+"%")
		argIdx++
	}

	if strings.TrimSpace(filter.TargetType) != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("target_type = $%d", argIdx))
		args = append(args, strings.TrimSpace(filter.TargetType))
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM audit_logs WHERE %s", whereSQL)
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count audit logs: %w", err)
	}

	selectQuery := fmt.Sprintf(`
		SELECT id, COALESCE(actor_id, ''), actor_username, actor_role, action,
		       target_type, target_id, status, ip_address, user_agent, details, created_at
		FROM audit_logs
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d;
	`, whereSQL, argIdx, argIdx+1)

	queryArgs := append(args, filter.Limit, filter.Offset)

	rows, err := r.pool.Query(ctx, selectQuery, queryArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("query audit logs: %w", err)
	}
	defer rows.Close()

	entries := make([]LogEntry, 0, filter.Limit)
	for rows.Next() {
		var (
			entry       LogEntry
			rawActorID  string
			detailsJSON []byte
		)

		err := rows.Scan(
			&entry.ID,
			&rawActorID,
			&entry.ActorUsername,
			&entry.ActorRole,
			&entry.Action,
			&entry.TargetType,
			&entry.TargetID,
			&entry.Status,
			&entry.IPAddress,
			&entry.UserAgent,
			&detailsJSON,
			&entry.CreatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("scan audit log: %w", err)
		}

		entry.ActorID = rawActorID
		entry.Details = make(map[string]interface{})
		if len(detailsJSON) > 0 {
			_ = json.Unmarshal(detailsJSON, &entry.Details)
		}

		entries = append(entries, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("read audit logs: %w", err)
	}

	return entries, total, nil
}
