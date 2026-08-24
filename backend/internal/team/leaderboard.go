package team

import (
	"context"
	"fmt"
)

func (r *Repository) GetLeaderboard(ctx context.Context) ([]LeaderboardEntry, error) {
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
	rows, err := r.pool.Query(ctx, query)
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
