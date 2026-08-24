package team

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// GetLeaderboard returns the live, up-to-the-minute leaderboard standings.
func (r *Repository) GetLeaderboard(ctx context.Context) ([]LeaderboardEntry, error) {
	return r.GetLeaderboardWithCutoff(ctx, nil)
}

// GetLeaderboardWithCutoff returns leaderboard standings computed either live (if cutoff is nil)
// or frozen as of the cutoff timestamp (if cutoff is non-nil).
func (r *Repository) GetLeaderboardWithCutoff(ctx context.Context, cutoff *time.Time) ([]LeaderboardEntry, error) {
	var rows pgx.Rows
	var err error

	if cutoff == nil {
		query := `
			SELECT 
				t.id AS team_id,
				t.name AS team_name,
				COALESCE(SUM(ps.best_score) FILTER (WHERE p.published), 0)::INT AS total_score,
				COUNT(DISTINCT ps.problem_id) FILTER (WHERE p.published AND ps.best_score > 0)::INT AS problems_solved,
				MAX(ps.updated_at) FILTER (WHERE p.published AND ps.best_score > 0) AS last_submission_at
			FROM teams t
			LEFT JOIN problem_scores ps ON t.id = ps.team_id
			LEFT JOIN problems p ON p.id = ps.problem_id
			GROUP BY t.id, t.name
			ORDER BY total_score DESC, last_submission_at ASC NULLS LAST, t.name ASC;
		`
		rows, err = r.pool.Query(ctx, query)
	} else {
		query := `
			WITH team_problem_scores AS (
				SELECT 
					s.team_id,
					s.problem_id,
					MAX(s.score) AS best_score,
					MAX(s.created_at) FILTER (WHERE s.score > 0) AS last_accepted_at
				FROM submissions s
				JOIN problems p ON p.id = s.problem_id AND p.published = true
				WHERE s.created_at <= $1 AND (s.review_status IS NULL OR s.review_status != 'rejected')
				GROUP BY s.team_id, s.problem_id
			)
			SELECT 
				t.id AS team_id,
				t.name AS team_name,
				COALESCE(SUM(tps.best_score), 0)::INT AS total_score,
				COUNT(DISTINCT tps.problem_id) FILTER (WHERE tps.best_score > 0)::INT AS problems_solved,
				MAX(tps.last_accepted_at) AS last_submission_at
			FROM teams t
			LEFT JOIN team_problem_scores tps ON t.id = tps.team_id
			GROUP BY t.id, t.name
			ORDER BY total_score DESC, last_submission_at ASC NULLS LAST, t.name ASC;
		`
		rows, err = r.pool.Query(ctx, query, *cutoff)
	}

	if err != nil {
		return nil, fmt.Errorf("query leaderboard: %w", err)
	}
	defer rows.Close()

	var entries []LeaderboardEntry
	rank := 1
	for rows.Next() {
		var entry LeaderboardEntry
		if err := rows.Scan(&entry.TeamID, &entry.TeamName, &entry.TotalScore, &entry.ProblemsSolved, &entry.LastSubmissionAt); err != nil {
			return nil, fmt.Errorf("scan leaderboard entry: %w", err)
		}
		entry.Rank = rank
		rank++
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}
