package proctor

import (
	"context"
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

func (r *Repository) GetUserProctorState(ctx context.Context, userID string) (bool, *time.Time, error) {
	var isExempt bool
	err := r.pool.QueryRow(ctx, `SELECT proctor_exempt FROM users WHERE id = $1;`, userID).Scan(&isExempt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return false, nil, fmt.Errorf("user not found")
		}
		return false, nil, fmt.Errorf("query user exemption: %w", err)
	}

	var lastPing *time.Time
	err = r.pool.QueryRow(ctx, `SELECT last_ping_at FROM telemetry_heartbeats WHERE user_id = $1;`, userID).Scan(&lastPing)
	if err != nil && err != pgx.ErrNoRows {
		return isExempt, nil, fmt.Errorf("query telemetry heartbeat: %w", err)
	}

	return isExempt, lastPing, nil
}
