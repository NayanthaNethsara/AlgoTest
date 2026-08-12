package user

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrDuplicateUsername = errors.New("username already exists")
	ErrNotFound          = errors.New("user not found")
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Create(ctx context.Context, username, displayName, passwordHash, role string) (User, error) {
	return r.CreateWithTeam(ctx, username, displayName, passwordHash, role, nil)
}

func (r *Repository) CreateWithTeam(ctx context.Context, username, displayName, passwordHash, role string, teamID *string) (User, error) {
	query := `
		INSERT INTO users (username, display_name, password_hash, role, team_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, username, display_name, role, created_at, last_login_at, team_id
	`
	var u User
	err := r.pool.QueryRow(ctx, query, username, displayName, passwordHash, role, teamID).Scan(
		&u.ID,
		&u.Username,
		&u.DisplayName,
		&u.Role,
		&u.CreatedAt,
		&u.LastLoginAt,
		&u.TeamID,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return User{}, ErrDuplicateUsername
		}
		return User{}, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

func (r *Repository) List(ctx context.Context) ([]User, error) {
	query := `
		SELECT u.id, u.username, u.display_name, u.role, u.created_at, u.last_login_at, u.team_id, t.name,
		       (u.proctor_exempt AND (u.proctor_exempt_until IS NULL OR u.proctor_exempt_until > now())) AS proctor_exempt,
		       u.proctor_allow_web_with_agent AND (u.proctor_access_until IS NULL OR u.proctor_access_until > now()),
		       u.proctor_allow_web_only AND (u.proctor_access_until IS NULL OR u.proctor_access_until > now()),
		       CASE WHEN u.proctor_access_until IS NULL OR u.proctor_access_until > now()
		            THEN u.proctor_access_reason ELSE '' END
		FROM users u
		LEFT JOIN teams t ON u.team_id = t.id
		ORDER BY u.created_at ASC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		err := rows.Scan(
			&u.ID,
			&u.Username,
			&u.DisplayName,
			&u.Role,
			&u.CreatedAt,
			&u.LastLoginAt,
			&u.TeamID,
			&u.TeamName,
			&u.ProctorExempt,
			&u.ProctorAllowWebAgent,
			&u.ProctorAllowWebOnly,
			&u.ProctorAccessReason,
		)
		if err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, nil
}

// GetForLogin returns the user together with its stored password hash.
func (r *Repository) GetForLogin(ctx context.Context, username string) (User, string, error) {
	query := `
		SELECT u.id, u.username, u.display_name, u.role, u.created_at, u.last_login_at, u.team_id, t.name,
		       (u.proctor_exempt AND (u.proctor_exempt_until IS NULL OR u.proctor_exempt_until > now())) AS proctor_exempt,
		       u.password_hash
		FROM users u
		LEFT JOIN teams t ON u.team_id = t.id
		WHERE u.username = $1
	`
	var u User
	var hash string
	err := r.pool.QueryRow(ctx, query, username).Scan(
		&u.ID,
		&u.Username,
		&u.DisplayName,
		&u.Role,
		&u.CreatedAt,
		&u.LastLoginAt,
		&u.TeamID,
		&u.TeamName,
		&u.ProctorExempt,
		&hash,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, "", ErrNotFound
		}
		return User{}, "", fmt.Errorf("get user for login: %w", err)
	}
	return u, hash, nil
}

func (r *Repository) GetByID(ctx context.Context, id string) (User, error) {
	query := `
		SELECT u.id, u.username, u.display_name, u.role, u.created_at, u.last_login_at, u.team_id, t.name,
		       (u.proctor_exempt AND (u.proctor_exempt_until IS NULL OR u.proctor_exempt_until > now())) AS proctor_exempt
		FROM users u
		LEFT JOIN teams t ON u.team_id = t.id
		WHERE u.id = $1
	`
	var u User
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&u.ID,
		&u.Username,
		&u.DisplayName,
		&u.Role,
		&u.CreatedAt,
		&u.LastLoginAt,
		&u.TeamID,
		&u.TeamName,
		&u.ProctorExempt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrNotFound
		}
		return User{}, fmt.Errorf("get user by id: %w", err)
	}
	return u, nil
}

func (r *Repository) UpdatePassword(ctx context.Context, id, passwordHash string) error {
	query := `UPDATE users SET password_hash = $2 WHERE id = $1`
	tag, err := r.pool.Exec(ctx, query, id, passwordHash)
	if err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) UpdateRole(ctx context.Context, id, role string) error {
	query := `UPDATE users SET role = $2 WHERE id = $1`
	tag, err := r.pool.Exec(ctx, query, id, role)
	if err != nil {
		return fmt.Errorf("update role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM users WHERE id = $1`
	tag, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) TouchLastLogin(ctx context.Context, id string) error {
	query := `UPDATE users SET last_login_at = now() WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("touch last login: %w", err)
	}
	return nil
}
