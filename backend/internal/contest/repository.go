package contest

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) GetSettings(ctx context.Context) (map[string]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT key, value FROM contest_settings WHERE key LIKE 'contest.%';`)
	if err != nil {
		return nil, fmt.Errorf("query contest settings: %w", err)
	}
	defer rows.Close()

	values := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, fmt.Errorf("scan contest setting: %w", err)
		}
		values[k] = v
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate contest settings: %w", err)
	}

	return values, nil
}

func (r *Repository) SaveSettings(ctx context.Context, updates map[string]string) error {
	for k, v := range updates {
		_, err := r.pool.Exec(ctx, `
			INSERT INTO contest_settings (key, value, updated_at)
			VALUES ($1, $2, now())
			ON CONFLICT (key) DO UPDATE
			SET value = EXCLUDED.value, updated_at = now();
		`, k, v)
		if err != nil {
			return fmt.Errorf("save contest setting %s: %w", k, err)
		}
	}
	return nil
}
