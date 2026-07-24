package session

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/db/sqlc"
)

type Session struct {
	UserID    string
	ExpiresAt time.Time
}

type Repository struct {
	q *sqlc.Queries
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{q: sqlc.New(pool)}
}

// Create stores only a hash of the token. The raw token lives solely in the
// caller's cookie, so a database leak can't be replayed as live sessions.
func (r *Repository) Create(ctx context.Context, token, userID string, expiresAt time.Time) error {
	return r.q.CreateSession(ctx, sqlc.CreateSessionParams{
		Token:     hashToken(token),
		UserID:    userID,
		ExpiresAt: expiresAt,
	})
}

func (r *Repository) Get(ctx context.Context, token string) (Session, error) {
	row, err := r.q.GetSession(ctx, hashToken(token))
	if err != nil {
		return Session{}, err
	}
	return Session{UserID: row.UserID, ExpiresAt: row.ExpiresAt}, nil
}

func (r *Repository) Delete(ctx context.Context, token string) error {
	return r.q.DeleteSession(ctx, hashToken(token))
}

// DeleteByUser revokes every session for a user (e.g. after a password reset).
func (r *Repository) DeleteByUser(ctx context.Context, userID string) error {
	return r.q.DeleteSessionsByUser(ctx, userID)
}

func (r *Repository) DeleteExpired(ctx context.Context) error {
	return r.q.DeleteExpiredSessions(ctx)
}

// hashToken maps a raw token to its at-rest identifier. The token is already
// 256 bits of entropy, so a fast hash (not bcrypt) is sufficient here.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
