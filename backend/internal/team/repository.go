package team

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

var (
	ErrTeamNotFound = errors.New("team not found")
	ErrTeamFull     = errors.New("team capacity reached (max 3 members)")
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

type CreateMemberParams struct {
	Username    string
	DisplayName string
	PasswordHash string
	Role        string
}

func (r *Repository) CreateTeam(ctx context.Context, name string) (*Team, error) {
	query := `
		INSERT INTO teams (name)
		VALUES ($1)
		RETURNING id, name, created_at
	`
	t := &Team{}
	err := r.pool.QueryRow(ctx, query, name).Scan(&t.ID, &t.Name, &t.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create team: %w", err)
	}
	return t, nil
}

func (r *Repository) CreateTeamWithMembers(ctx context.Context, name string, members []CreateMemberParams) (*Team, []user.User, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	t := &Team{}
	createTeamQuery := `INSERT INTO teams (name) VALUES ($1) RETURNING id, name, created_at`
	if err := tx.QueryRow(ctx, createTeamQuery, name).Scan(&t.ID, &t.Name, &t.CreatedAt); err != nil {
		return nil, nil, fmt.Errorf("create team: %w", err)
	}

	createdUsers := make([]user.User, 0, len(members))
	createUserQuery := `
		INSERT INTO users (username, display_name, password_hash, role, team_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, username, display_name, role, created_at, last_login_at, team_id
	`
	for _, m := range members {
		var u user.User
		err := tx.QueryRow(ctx, createUserQuery, m.Username, m.DisplayName, m.PasswordHash, m.Role, t.ID).Scan(
			&u.ID,
			&u.Username,
			&u.DisplayName,
			&u.Role,
			&u.CreatedAt,
			&u.LastLoginAt,
			&u.TeamID,
		)
		if err != nil {
			return nil, nil, fmt.Errorf("create team member %s: %w", m.Username, err)
		}
		u.TeamName = &t.Name
		createdUsers = append(createdUsers, u)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, fmt.Errorf("commit team creation: %w", err)
	}

	t.Members = createdUsers
	return t, createdUsers, nil
}

func (r *Repository) GetByID(ctx context.Context, id string) (*Team, error) {
	query := `
		SELECT id, name, created_at
		FROM teams
		WHERE id = $1
	`
	t := &Team{}
	err := r.pool.QueryRow(ctx, query, id).Scan(&t.ID, &t.Name, &t.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTeamNotFound
		}
		return nil, fmt.Errorf("get team by id: %w", err)
	}
	members, err := r.GetTeamMembers(ctx, t.ID)
	if err != nil {
		return nil, err
	}
	t.Members = members
	return t, nil
}

func (r *Repository) GetByName(ctx context.Context, name string) (*Team, error) {
	query := `
		SELECT id, name, created_at
		FROM teams
		WHERE name = $1
	`
	t := &Team{}
	err := r.pool.QueryRow(ctx, query, name).Scan(&t.ID, &t.Name, &t.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTeamNotFound
		}
		return nil, fmt.Errorf("get team by name: %w", err)
	}
	members, err := r.GetTeamMembers(ctx, t.ID)
	if err != nil {
		return nil, err
	}
	t.Members = members
	return t, nil
}

func (r *Repository) AddMember(ctx context.Context, teamID string, userID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var count int
	countQuery := `SELECT COUNT(*) FROM users WHERE team_id = $1`
	if err := tx.QueryRow(ctx, countQuery, teamID).Scan(&count); err != nil {
		return fmt.Errorf("check team count: %w", err)
	}
	if count >= MaxTeamMembers {
		return ErrTeamFull
	}

	updateQuery := `UPDATE users SET team_id = $1 WHERE id = $2 AND role = 'competitor'`
	tag, err := tx.Exec(ctx, updateQuery, teamID, userID)
	if err != nil {
		return fmt.Errorf("add user to team: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return user.ErrNotFound
	}
	return tx.Commit(ctx)
}

func (r *Repository) CreateAndAddMember(ctx context.Context, teamID string, m CreateMemberParams) (*user.User, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var count int
	countQuery := `SELECT COUNT(*) FROM users WHERE team_id = $1`
	if err := tx.QueryRow(ctx, countQuery, teamID).Scan(&count); err != nil {
		return nil, fmt.Errorf("check team count: %w", err)
	}
	if count >= MaxTeamMembers {
		return nil, ErrTeamFull
	}

	var teamName string
	teamQuery := `SELECT name FROM teams WHERE id = $1`
	if err := tx.QueryRow(ctx, teamQuery, teamID).Scan(&teamName); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTeamNotFound
		}
		return nil, fmt.Errorf("get team name: %w", err)
	}

	createUserQuery := `
		INSERT INTO users (username, display_name, password_hash, role, team_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, username, display_name, role, created_at, last_login_at, team_id
	`
	var u user.User
	err = tx.QueryRow(ctx, createUserQuery, m.Username, m.DisplayName, m.PasswordHash, m.Role, teamID).Scan(
		&u.ID,
		&u.Username,
		&u.DisplayName,
		&u.Role,
		&u.CreatedAt,
		&u.LastLoginAt,
		&u.TeamID,
	)
	if err != nil {
		return nil, fmt.Errorf("create user in team: %w", err)
	}
	u.TeamName = &teamName

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit create and add member: %w", err)
	}
	return &u, nil
}

func (r *Repository) RemoveMember(ctx context.Context, teamID string, userID string) error {
	query := `UPDATE users SET team_id = NULL WHERE id = $1 AND team_id = $2`
	tag, err := r.pool.Exec(ctx, query, userID, teamID)
	if err != nil {
		return fmt.Errorf("remove member from team: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return user.ErrNotFound
	}
	return nil
}

func (r *Repository) UpdateTeam(ctx context.Context, id string, name string) (*Team, error) {
	query := `
		UPDATE teams
		SET name = $1
		WHERE id = $2
		RETURNING id, name, created_at
	`
	t := &Team{}
	err := r.pool.QueryRow(ctx, query, name, id).Scan(&t.ID, &t.Name, &t.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTeamNotFound
		}
		return nil, fmt.Errorf("update team: %w", err)
	}
	members, err := r.GetTeamMembers(ctx, t.ID)
	if err != nil {
		return nil, err
	}
	t.Members = members
	return t, nil
}

func (r *Repository) DeleteTeam(ctx context.Context, id string) error {
	query := `DELETE FROM teams WHERE id = $1`
	tag, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("delete team: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrTeamNotFound
	}
	return nil
}

func (r *Repository) GetTeamMembers(ctx context.Context, teamID string) ([]user.User, error) {
	query := `
		SELECT u.id, u.username, u.display_name, u.role, u.created_at, u.last_login_at, u.team_id, t.name
		FROM users u
		LEFT JOIN teams t ON u.team_id = t.id
		WHERE u.team_id = $1
		ORDER BY u.created_at ASC
	`
	rows, err := r.pool.Query(ctx, query, teamID)
	if err != nil {
		return nil, fmt.Errorf("query team members: %w", err)
	}
	defer rows.Close()

	var members []user.User
	for rows.Next() {
		var u user.User
		err := rows.Scan(
			&u.ID,
			&u.Username,
			&u.DisplayName,
			&u.Role,
			&u.CreatedAt,
			&u.LastLoginAt,
			&u.TeamID,
			&u.TeamName,
		)
		if err != nil {
			return nil, fmt.Errorf("scan team member: %w", err)
		}
		members = append(members, u)
	}
	return members, nil
}

func (r *Repository) List(ctx context.Context) ([]*Team, error) {
	query := `
		SELECT id, name, created_at
		FROM teams
		ORDER BY name ASC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list teams query: %w", err)
	}
	defer rows.Close()

	var teams []*Team
	for rows.Next() {
		t := &Team{}
		if err := rows.Scan(&t.ID, &t.Name, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan team: %w", err)
		}
		teams = append(teams, t)
	}

	for _, t := range teams {
		members, err := r.GetTeamMembers(ctx, t.ID)
		if err != nil {
			return nil, err
		}
		t.Members = members
	}

	return teams, nil
}
