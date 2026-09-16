package problem

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("problem not found")
var ErrDuplicateSlug = errors.New("problem slug already exists")

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func scanProblem(row pgx.Row) (Problem, error) {
	var p Problem
	err := row.Scan(
		&p.ID,
		&p.Slug,
		&p.Title,
		&p.Difficulty,
		&p.Statement,
		&p.Constraints,
		&p.TimeLimitMs,
		&p.MemoryLimitMb,
		&p.MaxScore,
		&p.Published,
		&p.CreatedAt,
		&p.UpdatedAt,
	)
	return p, err
}

func (r *Repository) ListPublished(ctx context.Context) ([]Problem, error) {
	query := `
		SELECT id, slug, title, difficulty, statement, constraints, time_limit_ms, memory_limit_mb, max_score, published, created_at, updated_at
		FROM problems
		WHERE published = true
		ORDER BY created_at DESC;
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var problems []Problem
	for rows.Next() {
		p, err := scanProblem(rows)
		if err != nil {
			return nil, err
		}
		problems = append(problems, p)
	}
	return problems, rows.Err()
}

func (r *Repository) ListAll(ctx context.Context) ([]Problem, error) {
	query := `
		SELECT p.id, p.slug, p.title, p.difficulty, p.statement, p.constraints, p.time_limit_ms, p.memory_limit_mb, p.max_score, p.published, p.created_at, p.updated_at,
		       COALESCE(tc.test_count, 0) AS test_count
		FROM problems p
		LEFT JOIN (
			SELECT problem_id, COUNT(*) AS test_count
			FROM problem_tests
			GROUP BY problem_id
		) tc ON tc.problem_id = p.id
		ORDER BY p.created_at DESC;
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var problems []Problem
	for rows.Next() {
		var p Problem
		err := rows.Scan(
			&p.ID,
			&p.Slug,
			&p.Title,
			&p.Difficulty,
			&p.Statement,
			&p.Constraints,
			&p.TimeLimitMs,
			&p.MemoryLimitMb,
			&p.MaxScore,
			&p.Published,
			&p.CreatedAt,
			&p.UpdatedAt,
			&p.TestCount,
		)
		if err != nil {
			return nil, err
		}
		problems = append(problems, p)
	}
	return problems, rows.Err()
}

func (r *Repository) GetBySlug(ctx context.Context, slug string, includeTests bool) (ProblemDetail, error) {
	query := `
		SELECT id, slug, title, difficulty, statement, constraints, time_limit_ms, memory_limit_mb, max_score, published, created_at, updated_at
		FROM problems
		WHERE slug = $1;
	`
	p, err := scanProblem(r.pool.QueryRow(ctx, query, slug))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProblemDetail{}, ErrNotFound
		}
		return ProblemDetail{}, err
	}
	return r.assembleDetail(ctx, p, includeTests)
}

func (r *Repository) GetPublishedBySlug(ctx context.Context, slug string) (ProblemDetail, error) {
	query := `
		SELECT id, slug, title, difficulty, statement, constraints, time_limit_ms, memory_limit_mb, max_score, published, created_at, updated_at
		FROM problems
		WHERE slug = $1 AND published = true;
	`
	p, err := scanProblem(r.pool.QueryRow(ctx, query, slug))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			if detail, idErr := r.GetByID(ctx, slug, false); idErr == nil && detail.Published {
				return detail, nil
			}
			return ProblemDetail{}, ErrNotFound
		}
		return ProblemDetail{}, err
	}
	return r.assembleDetail(ctx, p, false)
}

func (r *Repository) GetByID(ctx context.Context, id string, includeTests bool) (ProblemDetail, error) {
	query := `
		SELECT id, slug, title, difficulty, statement, constraints, time_limit_ms, memory_limit_mb, max_score, published, created_at, updated_at
		FROM problems
		WHERE id = $1;
	`
	p, err := scanProblem(r.pool.QueryRow(ctx, query, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProblemDetail{}, ErrNotFound
		}
		return ProblemDetail{}, err
	}
	return r.assembleDetail(ctx, p, includeTests)
}

func (r *Repository) assembleDetail(ctx context.Context, p Problem, includeTests bool) (ProblemDetail, error) {
	samplesQuery := `
		SELECT id, problem_id, ordinal, input, output, explanation
		FROM problem_samples
		WHERE problem_id = $1
		ORDER BY ordinal;
	`
	sRows, err := r.pool.Query(ctx, samplesQuery, p.ID)
	if err != nil {
		return ProblemDetail{}, err
	}
	defer sRows.Close()

	var samples []Sample
	for sRows.Next() {
		var s Sample
		if err := sRows.Scan(&s.ID, &s.ProblemID, &s.Ordinal, &s.Input, &s.Output, &s.Explanation); err != nil {
			return ProblemDetail{}, err
		}
		samples = append(samples, s)
	}
	if err := sRows.Err(); err != nil {
		return ProblemDetail{}, err
	}

	detail := ProblemDetail{
		Problem: p,
		Samples: samples,
	}

	if includeTests {
		testsQuery := `
			SELECT id, problem_id, ordinal, input_sha, expected_sha, points
			FROM problem_tests
			WHERE problem_id = $1
			ORDER BY ordinal;
		`
		tRows, err := r.pool.Query(ctx, testsQuery, p.ID)
		if err != nil {
			return ProblemDetail{}, err
		}
		defer tRows.Close()

		var tests []TestMetadata
		for tRows.Next() {
			var t TestMetadata
			if err := tRows.Scan(&t.ID, &t.ProblemID, &t.Ordinal, &t.InputSHA, &t.ExpectedSHA, &t.Points); err != nil {
				return ProblemDetail{}, err
			}
			tests = append(tests, t)
		}
		if err := tRows.Err(); err != nil {
			return ProblemDetail{}, err
		}
		detail.Tests = tests
	}

	return detail, nil
}

func (r *Repository) Create(ctx context.Context, input CreateProblemInput) (ProblemDetail, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return ProblemDetail{}, err
	}
	defer tx.Rollback(ctx)

	input.TimeLimitMs, input.MemoryLimitMb, input.MaxScore = ClampLimits(input.TimeLimitMs, input.MemoryLimitMb, input.MaxScore)

	insertProblem := `
		INSERT INTO problems (slug, title, difficulty, statement, constraints, time_limit_ms, memory_limit_mb, max_score, published)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, slug, title, difficulty, statement, constraints, time_limit_ms, memory_limit_mb, max_score, published, created_at, updated_at;
	`
	p, err := scanProblem(tx.QueryRow(ctx, insertProblem,
		input.Slug, input.Title, input.Difficulty, input.Statement, input.Constraints,
		input.TimeLimitMs, input.MemoryLimitMb, input.MaxScore, input.Published,
	))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ProblemDetail{}, ErrDuplicateSlug
		}
		return ProblemDetail{}, err
	}

	samples := make([]Sample, 0, len(input.Samples))
	insertSample := `
		INSERT INTO problem_samples (problem_id, ordinal, input, output, explanation)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, problem_id, ordinal, input, output, explanation;
	`
	for i, s := range input.Samples {
		ord := int32(i + 1)
		var createdSample Sample
		err := tx.QueryRow(ctx, insertSample, p.ID, ord, s.Input, s.Output, s.Explanation).Scan(
			&createdSample.ID, &createdSample.ProblemID, &createdSample.Ordinal, &createdSample.Input, &createdSample.Output, &createdSample.Explanation,
		)
		if err != nil {
			return ProblemDetail{}, err
		}
		samples = append(samples, createdSample)
	}

	if err := tx.Commit(ctx); err != nil {
		return ProblemDetail{}, err
	}

	return ProblemDetail{
		Problem: p,
		Samples: samples,
	}, nil
}

func (r *Repository) Update(ctx context.Context, id string, input CreateProblemInput) (ProblemDetail, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return ProblemDetail{}, err
	}
	defer tx.Rollback(ctx)

	input.TimeLimitMs, input.MemoryLimitMb, input.MaxScore = ClampLimits(input.TimeLimitMs, input.MemoryLimitMb, input.MaxScore)

	var oldMaxScore int32
	_ = tx.QueryRow(ctx, `SELECT max_score FROM problems WHERE id = $1;`, id).Scan(&oldMaxScore)

	updateProblem := `
		UPDATE problems
		SET title = $2, difficulty = $3, statement = $4, constraints = $5, time_limit_ms = $6, memory_limit_mb = $7, max_score = $8, published = $9, updated_at = now()
		WHERE id = $1
		RETURNING id, slug, title, difficulty, statement, constraints, time_limit_ms, memory_limit_mb, max_score, published, created_at, updated_at;
	`
	p, err := scanProblem(tx.QueryRow(ctx, updateProblem,
		id, input.Title, input.Difficulty, input.Statement, input.Constraints,
		input.TimeLimitMs, input.MemoryLimitMb, input.MaxScore, input.Published,
	))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProblemDetail{}, ErrNotFound
		}
		return ProblemDetail{}, err
	}

	if oldMaxScore != input.MaxScore {
		rows, err := tx.Query(ctx, `SELECT points FROM problem_tests WHERE problem_id = $1 ORDER BY ordinal ASC;`, id)
		if err == nil {
			var testPoints []int32
			for rows.Next() {
				var pt int32
				if err := rows.Scan(&pt); err == nil {
					testPoints = append(testPoints, pt)
				}
			}
			rows.Close()
			if len(testPoints) > 0 && IsEvenDistribution(testPoints, oldMaxScore) {
				_ = DistributeProblemPointsTx(ctx, tx, id, input.MaxScore)
			}
		}
	}

	if _, err := tx.Exec(ctx, `DELETE FROM problem_samples WHERE problem_id = $1;`, id); err != nil {
		return ProblemDetail{}, err
	}

	samples := make([]Sample, 0, len(input.Samples))
	insertSample := `
		INSERT INTO problem_samples (problem_id, ordinal, input, output, explanation)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, problem_id, ordinal, input, output, explanation;
	`
	for i, s := range input.Samples {
		ord := int32(i + 1)
		var createdSample Sample
		err := tx.QueryRow(ctx, insertSample, p.ID, ord, s.Input, s.Output, s.Explanation).Scan(
			&createdSample.ID, &createdSample.ProblemID, &createdSample.Ordinal, &createdSample.Input, &createdSample.Output, &createdSample.Explanation,
		)
		if err != nil {
			return ProblemDetail{}, err
		}
		samples = append(samples, createdSample)
	}

	if err := tx.Commit(ctx); err != nil {
		return ProblemDetail{}, err
	}

	return ProblemDetail{
		Problem: p,
		Samples: samples,
	}, nil
}

func (r *Repository) SetPublished(ctx context.Context, id string, published bool) error {
	cmd, err := r.pool.Exec(ctx, `UPDATE problems SET published = $2, updated_at = now() WHERE id = $1;`, id, published)
	return notFoundIfZero(cmd.RowsAffected(), err)
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	cmd, err := r.pool.Exec(ctx, `DELETE FROM problems WHERE id = $1;`, id)
	return notFoundIfZero(cmd.RowsAffected(), err)
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

