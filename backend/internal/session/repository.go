package session

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

// Create enforces a single active session per user by invalidating prior sessions
// for that user during login.
func (r *Repository) Create(ctx context.Context, token, userID string, expiresAt time.Time) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin session tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1;`, userID); err != nil {
		return fmt.Errorf("delete prior user sessions: %w", err)
	}

	insertQuery := `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3);`
	if _, err := tx.Exec(ctx, insertQuery, hashToken(token), userID, expiresAt); err != nil {
		return fmt.Errorf("insert session: %w", err)
	}

	return tx.Commit(ctx)
}

func (r *Repository) Get(ctx context.Context, token string) (Session, error) {
	query := `SELECT user_id, expires_at FROM sessions WHERE token = $1 AND expires_at >= now();`
	var s Session
	err := r.pool.QueryRow(ctx, query, hashToken(token)).Scan(&s.UserID, &s.ExpiresAt)
	if err != nil {
		return Session{}, err
	}
	return s, nil
}

func (r *Repository) Delete(ctx context.Context, token string) error {
	query := `DELETE FROM sessions WHERE token = $1;`
	_, err := r.pool.Exec(ctx, query, hashToken(token))
	return err
}

func (r *Repository) DeleteByUser(ctx context.Context, userID string) error {
	query := `DELETE FROM sessions WHERE user_id = $1;`
	_, err := r.pool.Exec(ctx, query, userID)
	return err
}

func (r *Repository) DeleteByUserExcept(ctx context.Context, userID, exceptToken string) error {
	query := `DELETE FROM sessions WHERE user_id = $1 AND token != $2;`
	_, err := r.pool.Exec(ctx, query, userID, hashToken(exceptToken))
	return err
}

func (r *Repository) DeleteExpired(ctx context.Context) error {
	query := `DELETE FROM sessions WHERE expires_at < now();`
	_, err := r.pool.Exec(ctx, query)
	return err
}
