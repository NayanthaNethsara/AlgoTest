package judge

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// HasActiveSubmission checks if a team already has a submission queued or running for a given problem.
func (r *Repository) HasActiveSubmission(ctx context.Context, teamID, problemID string) (bool, error) {
	query := `
		SELECT EXISTS (
			SELECT 1 FROM submissions
			WHERE team_id = $1 AND problem_id = $2
			  AND state IN ('queued', 'running') AND NOT is_rejudge
		);
	`
	var active bool
	err := r.pool.QueryRow(ctx, query, teamID, problemID).Scan(&active)
	if err != nil {
		return false, fmt.Errorf("check active submission: %w", err)
	}
	return active, nil
}

// CreateSubmission validates problem parameters, guards against active submissions, and inserts a new submission into the queue.
func (r *Repository) CreateSubmission(ctx context.Context, s Submission) (*Submission, error) {
	var recentCount int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM submissions
		WHERE team_id = $1 AND created_at > NOW() - INTERVAL '3 seconds';
	`, s.TeamID).Scan(&recentCount)
	if err == nil && recentCount > 0 {
		return nil, ErrSubmissionRateLimited
	}

	active, err := r.HasActiveSubmission(ctx, s.TeamID, s.ProblemID)
	if err != nil {
		return nil, err
	}
	if active {
		return nil, ErrActiveSubmissionExists
	}

	var declaredMax, pointsTotal, testsTotal int
	err = r.pool.QueryRow(ctx, `
		SELECT p.max_score,
		       COALESCE((SELECT SUM(points) FROM problem_tests WHERE problem_id = p.id), 0)::INT,
		       (SELECT COUNT(*) FROM problem_tests WHERE problem_id = p.id)::INT
		FROM problems p
		WHERE p.id = $1;
	`, s.ProblemID).Scan(&declaredMax, &pointsTotal, &testsTotal)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProblemNotFound
		}
		return nil, fmt.Errorf("fetch problem metadata: %w", err)
	}

	if testsTotal == 0 {
		return nil, ErrNoTestCases
	}

	maxScore := pointsTotal
	if maxScore <= 0 {
		maxScore = declaredMax
	}

	s.State = StatusQueued
	s.MaxScore = maxScore
	s.TestsTotal = testsTotal
	s.CreatedAt = time.Now().UTC()

	query := `
		INSERT INTO submissions (id, team_id, user_id, problem_id, language, code, state, max_score, tests_total, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING created_at;
	`
	err = r.pool.QueryRow(ctx, query,
		s.ID, s.TeamID, s.UserID, s.ProblemID, s.Language, s.Code, s.State, s.MaxScore, s.TestsTotal, s.CreatedAt,
	).Scan(&s.CreatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrActiveSubmissionExists
		}
		return nil, fmt.Errorf("insert submission: %w", err)
	}

	var pos int
	if err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM submissions
		WHERE state = 'queued' AND created_at <= $1;
	`, s.CreatedAt).Scan(&pos); err != nil {
		pos = 1
	}
	s.QueuePosition = pos

	go func() {
		nCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_, _ = r.pool.Exec(nCtx, "SELECT pg_notify('judge_new_submission', '')")
	}()

	return &s, nil
}

// GetSubmission fetches a submission by ID along with test case details and live queue position if queued.
func (r *Repository) GetSubmission(ctx context.Context, id string) (*Result, bool, error) {
	query := `
		SELECT id, user_id, team_id, problem_id, state, verdict, score, max_score, tests_total, tests_done, compile_error, created_at, finished_at,
		       review_status, review_reason, reviewed_at
		FROM submissions
		WHERE id = $1;
	`
	var res Result
	var stateStr, reviewStatus string
	var verdict, compileErr *string
	var finishedAt, reviewedAt *time.Time

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&res.SubmissionID, &res.UserID, &res.TeamID, &res.ProblemID, &stateStr, &verdict,
		&res.Score, &res.MaxScore, &res.TestsTotal, &res.TestsDone,
		&compileErr, &res.CreatedAt, &finishedAt,
		&reviewStatus, &res.ReviewReason, &reviewedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("get submission: %w", err)
	}

	res.Status = Status(stateStr)
	res.Verdict = verdict
	res.CompileError = compileErr
	res.FinishedAt = finishedAt
	res.ReviewStatus = ReviewStatus(reviewStatus)
	res.ReviewedAt = reviewedAt

	if res.Status == StatusQueued {
		var pos int
		if err := r.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM submissions
			WHERE state = 'queued' AND created_at <= $1;
		`, res.CreatedAt).Scan(&pos); err != nil {
			pos = 1
		}
		res.QueuePosition = pos
	}

	rows, err := r.pool.Query(ctx, `
		SELECT st.submission_id, st.ordinal, st.verdict, st.time_ms, st.memory_kb, st.points,
		       COALESCE(NULLIF(st.max_points, 0), pt.points, 0) AS max_points
		FROM submission_tests st
		JOIN submissions s ON s.id = st.submission_id
		LEFT JOIN problem_tests pt ON pt.problem_id = s.problem_id AND pt.ordinal = st.ordinal
		WHERE st.submission_id = $1
		ORDER BY st.ordinal ASC;
	`, id)
	if err == nil {
		defer rows.Close()
		var tests []SubmissionTest
		for rows.Next() {
			var t SubmissionTest
			if err := rows.Scan(&t.SubmissionID, &t.Ordinal, &t.Verdict, &t.TimeMS, &t.MemoryKB, &t.Points, &t.MaxPoints); err == nil {
				tests = append(tests, t)
			}
		}
		if len(tests) > 0 {
			allZeroMax := true
			for _, t := range tests {
				if t.MaxPoints > 0 {
					allZeroMax = false
					break
				}
			}
			if allZeroMax && res.MaxScore > 0 {
				base := res.MaxScore / len(tests)
				remainder := res.MaxScore % len(tests)
				for i := range tests {
					tests[i].MaxPoints = base
					if i < remainder {
						tests[i].MaxPoints++
					}
				}
			}
		}
		res.Tests = tests
	}

	return &res, true, nil
}
