package problem

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/db/sqlc"
)

// ErrNotFound is returned when a targeted problem row does not exist.
var ErrNotFound = errors.New("problem not found")

// ErrDuplicateSlug is returned by Create when the problem slug is already taken.
var ErrDuplicateSlug = errors.New("problem slug already exists")

type Repository struct {
	pool *pgxpool.Pool
	q    *sqlc.Queries
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{
		pool: pool,
		q:    sqlc.New(pool),
	}
}

func toProblem(p sqlc.Problem) Problem {
	return Problem{
		ID:            p.ID,
		Slug:          p.Slug,
		Title:         p.Title,
		Difficulty:    p.Difficulty,
		Statement:     p.Statement,
		Constraints:   p.Constraints,
		TimeLimitMs:   p.TimeLimitMs,
		MemoryLimitMb: p.MemoryLimitMb,
		MaxScore:      p.MaxScore,
		Published:     p.Published,
		CreatedAt:     p.CreatedAt,
		UpdatedAt:     p.UpdatedAt,
	}
}

func toSample(s sqlc.ProblemSample) Sample {
	return Sample{
		ID:          s.ID,
		ProblemID:   s.ProblemID,
		Ordinal:     s.Ordinal,
		Input:       s.Input,
		Output:      s.Output,
		Explanation: s.Explanation,
	}
}

func (r *Repository) ListPublished(ctx context.Context) ([]Problem, error) {
	rows, err := r.q.ListPublishedProblems(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]Problem, len(rows))
	for i, row := range rows {
		result[i] = toProblem(row)
	}
	return result, nil
}

func (r *Repository) ListAll(ctx context.Context) ([]Problem, error) {
	rows, err := r.q.ListAllProblems(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]Problem, len(rows))
	for i, row := range rows {
		result[i] = toProblem(row)
	}
	return result, nil
}

func (r *Repository) GetBySlug(ctx context.Context, slug string, includeTests bool) (ProblemDetail, error) {
	p, err := r.q.GetProblemBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProblemDetail{}, ErrNotFound
		}
		return ProblemDetail{}, err
	}
	return r.assembleDetail(ctx, p, includeTests)
}

func (r *Repository) GetPublishedBySlug(ctx context.Context, slug string) (ProblemDetail, error) {
	p, err := r.q.GetPublishedProblemBySlug(ctx, slug)
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
	p, err := r.q.GetProblemByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProblemDetail{}, ErrNotFound
		}
		return ProblemDetail{}, err
	}
	return r.assembleDetail(ctx, p, includeTests)
}

func (r *Repository) assembleDetail(ctx context.Context, p sqlc.Problem, includeTests bool) (ProblemDetail, error) {
	samplesRows, err := r.q.GetSamplesForProblem(ctx, p.ID)
	if err != nil {
		return ProblemDetail{}, err
	}
	samples := make([]Sample, len(samplesRows))
	for i, s := range samplesRows {
		samples[i] = toSample(s)
	}

	detail := ProblemDetail{
		Problem: toProblem(p),
		Samples: samples,
	}

	if includeTests {
		testsRows, err := r.q.GetTestsForProblem(ctx, p.ID)
		if err != nil {
			return ProblemDetail{}, err
		}
		tests := make([]TestMetadata, len(testsRows))
		for i, t := range testsRows {
			tests[i] = TestMetadata{
				ID:          t.ID,
				ProblemID:   t.ProblemID,
				Ordinal:     t.Ordinal,
				InputSHA:    t.InputSha,
				ExpectedSHA: t.ExpectedSha,
				Points:      t.Points,
			}
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
	qtx := r.q.WithTx(tx)

	if input.TimeLimitMs <= 0 {
		input.TimeLimitMs = 4000
	}
	if input.MemoryLimitMb <= 0 {
		input.MemoryLimitMb = 256
	}

	p, err := qtx.CreateProblem(ctx, sqlc.CreateProblemParams{
		Slug:          input.Slug,
		Title:         input.Title,
		Difficulty:    input.Difficulty,
		Statement:     input.Statement,
		Constraints:   input.Constraints,
		TimeLimitMs:   input.TimeLimitMs,
		MemoryLimitMb: input.MemoryLimitMb,
		MaxScore:      input.MaxScore,
		Published:     input.Published,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ProblemDetail{}, ErrDuplicateSlug
		}
		return ProblemDetail{}, err
	}

	samples := make([]Sample, 0, len(input.Samples))
	for i, s := range input.Samples {
		ord := s.Ordinal
		if ord <= 0 {
			ord = int32(i + 1)
		}
		createdSample, err := qtx.CreateSample(ctx, sqlc.CreateSampleParams{
			ProblemID:   p.ID,
			Ordinal:     ord,
			Input:       s.Input,
			Output:      s.Output,
			Explanation: s.Explanation,
		})
		if err != nil {
			return ProblemDetail{}, err
		}
		samples = append(samples, toSample(createdSample))
	}

	if err := tx.Commit(ctx); err != nil {
		return ProblemDetail{}, err
	}

	return ProblemDetail{
		Problem: toProblem(p),
		Samples: samples,
	}, nil
}

func (r *Repository) Update(ctx context.Context, id string, input CreateProblemInput) (ProblemDetail, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return ProblemDetail{}, err
	}
	defer tx.Rollback(ctx)
	qtx := r.q.WithTx(tx)

	p, err := qtx.UpdateProblem(ctx, sqlc.UpdateProblemParams{
		ID:            id,
		Title:         input.Title,
		Difficulty:    input.Difficulty,
		Statement:     input.Statement,
		Constraints:   input.Constraints,
		TimeLimitMs:   input.TimeLimitMs,
		MemoryLimitMb: input.MemoryLimitMb,
		MaxScore:      input.MaxScore,
		Published:     input.Published,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProblemDetail{}, ErrNotFound
		}
		return ProblemDetail{}, err
	}

	if err := qtx.DeleteSamplesForProblem(ctx, id); err != nil {
		return ProblemDetail{}, err
	}

	samples := make([]Sample, 0, len(input.Samples))
	for i, s := range input.Samples {
		ord := s.Ordinal
		if ord <= 0 {
			ord = int32(i + 1)
		}
		createdSample, err := qtx.CreateSample(ctx, sqlc.CreateSampleParams{
			ProblemID:   p.ID,
			Ordinal:     ord,
			Input:       s.Input,
			Output:      s.Output,
			Explanation: s.Explanation,
		})
		if err != nil {
			return ProblemDetail{}, err
		}
		samples = append(samples, toSample(createdSample))
	}

	if err := tx.Commit(ctx); err != nil {
		return ProblemDetail{}, err
	}

	return ProblemDetail{
		Problem: toProblem(p),
		Samples: samples,
	}, nil
}

func (r *Repository) SetPublished(ctx context.Context, id string, published bool) error {
	n, err := r.q.SetProblemPublished(ctx, sqlc.SetProblemPublishedParams{
		ID:        id,
		Published: published,
	})
	return notFoundIfZero(n, err)
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	n, err := r.q.DeleteProblem(ctx, id)
	return notFoundIfZero(n, err)
}

func (r *Repository) ReplaceTests(ctx context.Context, problemID string, tests []TestInput) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	qtx := r.q.WithTx(tx)

	var maxScore int32
	if err := tx.QueryRow(ctx, `SELECT max_score FROM problems WHERE id = $1;`, problemID).Scan(&maxScore); err != nil {
		return fmt.Errorf("failed to read problem max_score: %w", err)
	}
	DistributePoints(tests, maxScore)

	if err := qtx.DeleteTestsForProblem(ctx, problemID); err != nil {
		return err
	}

	for i, t := range tests {
		ord := t.Ordinal
		if ord <= 0 {
			ord = int32(i + 1)
		}
		inSha := sha256Hex(t.Input)
		expSha := sha256Hex(t.Expected)
		pts := t.Points
		if pts <= 0 {
			pts = 1
		}
		_, err := qtx.CreateTest(ctx, sqlc.CreateTestParams{
			ProblemID:   problemID,
			Ordinal:     ord,
			Input:       t.Input,
			Expected:    t.Expected,
			InputSha:    inSha,
			ExpectedSha: expSha,
			Points:      pts,
		})
		if err != nil {
			return fmt.Errorf("failed to create test case %d: %w", ord, err)
		}
	}

	return tx.Commit(ctx)
}

func (r *Repository) GetFullTests(ctx context.Context, problemID string) ([]TestInput, error) {
	rows, err := r.q.GetFullTestsForProblem(ctx, problemID)
	if err != nil {
		return nil, err
	}
	result := make([]TestInput, len(rows))
	for i, row := range rows {
		result[i] = TestInput{
			Ordinal:  row.Ordinal,
			Input:    row.Input,
			Expected: row.Expected,
			Points:   row.Points,
		}
	}
	return result, nil
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

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
