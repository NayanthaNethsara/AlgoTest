package judge

import (
	"context"
	"fmt"
	"time"
)

func (r *Repository) ListAdminSubmissions(ctx context.Context, statusFilter, problemID, teamID string, limit, offset int) ([]AdminSubmissionItem, int, error) {
	whereClause := "WHERE 1=1"
	args := []interface{}{}
	argID := 1

	if teamID != "" {
		whereClause += fmt.Sprintf(" AND s.team_id = $%d", argID)
		args = append(args, teamID)
		argID++
	}

	return r.listSubmissions(ctx, whereClause, args, argID, statusFilter, problemID, limit, offset, false)
}

func (r *Repository) ListOwnSubmissions(ctx context.Context, statusFilter, problemID, userID, teamID string, limit, offset int, includeCode bool) ([]AdminSubmissionItem, int, error) {
	if userID == "" {
		return nil, 0, fmt.Errorf("list own submissions: no user")
	}

	args := []interface{}{userID}
	argID := 2

	ownerClause := "WHERE s.user_id = $1"
	if teamID != "" {
		ownerClause = fmt.Sprintf("WHERE (s.user_id = $1 OR s.team_id = $%d)", argID)
		args = append(args, teamID)
		argID++
	}

	return r.listSubmissions(ctx, ownerClause, args, argID, statusFilter, problemID, limit, offset, includeCode)
}

func (r *Repository) listSubmissions(
	ctx context.Context,
	whereClause string,
	args []interface{},
	argID int,
	statusFilter, problemID string,
	limit, offset int,
	includeCode bool,
) ([]AdminSubmissionItem, int, error) {
	if limit <= 0 {
		limit = 50
	}

	if statusFilter != "" {
		whereClause += fmt.Sprintf(" AND s.state = $%d", argID)
		args = append(args, statusFilter)
		argID++
	}
	if problemID != "" {
		whereClause += fmt.Sprintf(" AND s.problem_id = $%d", argID)
		args = append(args, problemID)
		argID++
	}

	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM submissions s %s;`, whereClause)
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count admin submissions: %w", err)
	}

	codeColumn := "'' AS code"
	if includeCode {
		codeColumn = "s.code"
	}

	query := fmt.Sprintf(`
		SELECT s.id, s.user_id, s.team_id, s.problem_id, s.language, %s, s.state, s.verdict, s.score, s.max_score,
		       s.tests_total, s.tests_done, s.compile_error, s.created_at, s.finished_at,
		       COALESCE(u.display_name, u.username, '') AS user_name,
		       '' AS user_email,
		       COALESCE(t.name, '') AS team_name,
		       COALESCE(p.title, '') AS problem_title,
		       s.review_status, s.review_reason, s.reviewed_at,
		       COALESCE(rv.display_name, rv.username, '') AS reviewed_by
		FROM submissions s
		LEFT JOIN users u ON s.user_id = u.id
		LEFT JOIN teams t ON s.team_id = t.id
		LEFT JOIN problems p ON s.problem_id = p.id
		LEFT JOIN users rv ON s.reviewed_by = rv.id
		%s
		ORDER BY s.created_at DESC
		LIMIT $%d OFFSET $%d;
	`, codeColumn, whereClause, argID, argID+1)

	args = append(args, limit, offset)
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("query admin submissions: %w", err)
	}
	defer rows.Close()

	var list []AdminSubmissionItem
	for rows.Next() {
		var item AdminSubmissionItem
		var stateStr, reviewStatus string
		var verdict, compileErr *string
		var finishedAt, reviewedAt *time.Time

		err := rows.Scan(
			&item.SubmissionID, &item.UserID, &item.TeamID, &item.ProblemID, &item.Language, &item.Code,
			&stateStr, &verdict, &item.Score, &item.MaxScore, &item.TestsTotal, &item.TestsDone,
			&compileErr, &item.CreatedAt, &finishedAt,
			&item.UserName, &item.UserEmail, &item.TeamName, &item.ProblemTitle,
			&reviewStatus, &item.ReviewReason, &reviewedAt, &item.ReviewedBy,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("scan admin submission: %w", err)
		}
		item.Status = Status(stateStr)
		item.Verdict = verdict
		item.CompileError = compileErr
		item.FinishedAt = finishedAt
		item.ReviewStatus = ReviewStatus(reviewStatus)
		item.ReviewedAt = reviewedAt
		list = append(list, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("read admin submissions: %w", err)
	}

	return list, total, nil
}

func (r *Repository) GetTeamProgress(ctx context.Context, teamID string, userID string) (map[string]ProblemProgress, error) {
	query := `
		SELECT ps.problem_id, ps.best_score, COALESCE(p.max_score, 100) AS max_score
		FROM problem_scores ps
		JOIN problems p ON ps.problem_id = p.id
		WHERE (NULLIF($1, '') IS NOT NULL AND ps.team_id = NULLIF($1, '')::uuid)
		   OR (NULLIF($2, '') IS NOT NULL AND ps.user_id = NULLIF($2, '')::uuid);
	`
	rows, err := r.pool.Query(ctx, query, teamID, userID)
	if err != nil {
		return nil, fmt.Errorf("query team progress: %w", err)
	}
	defer rows.Close()

	result := make(map[string]ProblemProgress)
	for rows.Next() {
		var probID string
		var bestScore, maxScore int
		if err := rows.Scan(&probID, &bestScore, &maxScore); err == nil {
			status := "attempted"
			if bestScore >= maxScore && maxScore > 0 {
				status = "solved"
			}
			result[probID] = ProblemProgress{
				ProblemID: probID,
				BestScore: bestScore,
				Status:    status,
			}
		}
	}
	return result, nil
}

func (r *Repository) GetSubmissionCounts(ctx context.Context) (SubmissionCounts, error) {
	query := `
		SELECT 
			COALESCE(COUNT(*) FILTER (WHERE state = 'queued'), 0)::INT,
			COALESCE(COUNT(*) FILTER (WHERE state = 'running'), 0)::INT,
			COALESCE(COUNT(*) FILTER (WHERE state = 'passed'), 0)::INT,
			COALESCE(COUNT(*) FILTER (WHERE state = 'failed'), 0)::INT,
			COALESCE(COUNT(*) FILTER (WHERE review_status = 'rejected'), 0)::INT
		FROM submissions;
	`
	var counts SubmissionCounts
	err := r.pool.QueryRow(ctx, query).Scan(
		&counts.Queued,
		&counts.Running,
		&counts.Passed,
		&counts.Failed,
		&counts.Rejected,
	)
	if err != nil {
		return SubmissionCounts{}, fmt.Errorf("get submission counts: %w", err)
	}
	return counts, nil
}
