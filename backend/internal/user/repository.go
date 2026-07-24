package user

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/db/sqlc"
)

// ErrDuplicateUsername is returned by Create when the username is already taken.
var ErrDuplicateUsername = errors.New("username already exists")

// ErrNotFound is returned when a targeted user row does not exist.
var ErrNotFound = errors.New("user not found")

type Repository struct {
	q *sqlc.Queries
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{q: sqlc.New(pool)}
}

func (r *Repository) Create(ctx context.Context, username, displayName, passwordHash, role string) (User, error) {
	row, err := r.q.CreateUser(ctx, sqlc.CreateUserParams{
		Username:     username,
		DisplayName:  displayName,
		PasswordHash: passwordHash,
		Role:         role,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return User{}, ErrDuplicateUsername
		}
		return User{}, err
	}
	return toDomain(row), nil
}

func (r *Repository) List(ctx context.Context) ([]User, error) {
	rows, err := r.q.ListUsers(ctx)
	if err != nil {
		return nil, err
	}
	users := make([]User, len(rows))
	for i, row := range rows {
		users[i] = toDomain(row)
	}
	return users, nil
}

// GetForLogin returns the user together with its stored password hash.
func (r *Repository) GetForLogin(ctx context.Context, username string) (User, string, error) {
	row, err := r.q.GetUserByUsername(ctx, username)
	if err != nil {
		return User{}, "", err
	}
	return toDomain(row), row.PasswordHash, nil
}

func (r *Repository) GetByID(ctx context.Context, id string) (User, error) {
	row, err := r.q.GetUserByID(ctx, id)
	if err != nil {
		return User{}, err
	}
	return toDomain(row), nil
}

func (r *Repository) UpdatePassword(ctx context.Context, id, passwordHash string) error {
	n, err := r.q.UpdateUserPassword(ctx, sqlc.UpdateUserPasswordParams{ID: id, PasswordHash: passwordHash})
	return notFoundIfZero(n, err)
}

func (r *Repository) UpdateRole(ctx context.Context, id, role string) error {
	n, err := r.q.UpdateUserRole(ctx, sqlc.UpdateUserRoleParams{ID: id, Role: role})
	return notFoundIfZero(n, err)
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	n, err := r.q.DeleteUser(ctx, id)
	return notFoundIfZero(n, err)
}

func (r *Repository) TouchLastLogin(ctx context.Context, id string) error {
	return r.q.TouchUserLastLogin(ctx, id)
}

func toDomain(row sqlc.User) User {
	return User{
		ID:          row.ID,
		Username:    row.Username,
		DisplayName: row.DisplayName,
		Role:        row.Role,
		CreatedAt:   row.CreatedAt,
		LastLoginAt: row.LastLoginAt,
	}
}

func notFoundIfZero(n int64, err error) error {
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
