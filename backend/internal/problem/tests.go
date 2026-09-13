package problem

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/crypto"
)

func (r *Repository) ReplaceTests(ctx context.Context, problemID string, tests []TestInput) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var maxScore int32
	if err := tx.QueryRow(ctx, `SELECT max_score FROM problems WHERE id = $1;`, problemID).Scan(&maxScore); err != nil {
		return fmt.Errorf("failed to read problem max_score: %w", err)
	}
	if err := ValidateTestPoints(tests, maxScore); err != nil {
		return err
	}
	DistributePoints(tests, maxScore)

	if _, err := tx.Exec(ctx, `DELETE FROM problem_tests WHERE problem_id = $1;`, problemID); err != nil {
		return err
	}

	insertTest := `
		INSERT INTO problem_tests (problem_id, ordinal, input, expected, input_sha, expected_sha, points)
		VALUES ($1, $2, $3, $4, $5, $6, $7);
	`
	for i, t := range tests {
		ord := int32(i + 1)
		inSha := crypto.SHA256Hex(t.Input)
		expSha := crypto.SHA256Hex(t.Expected)
		pts := t.Points
		if pts <= 0 {
			pts = 1
		}
		_, err := tx.Exec(ctx, insertTest, problemID, ord, t.Input, t.Expected, inSha, expSha, pts)
		if err != nil {
			return fmt.Errorf("failed to create test case %d: %w", ord, err)
		}
	}

	return tx.Commit(ctx)
}

func (r *Repository) GetFullTests(ctx context.Context, problemID string) ([]TestInput, error) {
	query := `
		SELECT ordinal, input, expected, points
		FROM problem_tests
		WHERE problem_id = $1
		ORDER BY ordinal;
	`
	rows, err := r.pool.Query(ctx, query, problemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []TestInput
	for rows.Next() {
		var t TestInput
		if err := rows.Scan(&t.Ordinal, &t.Input, &t.Expected, &t.Points); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

func (r *Repository) GetTestMetadata(ctx context.Context, problemID string) ([]TestCaseMetadata, error) {
	query := `
		SELECT ordinal,
		       octet_length(input),
		       octet_length(expected),
		       input_sha,
		       expected_sha,
		       substring(input from 1 for 256),
		       substring(expected from 1 for 256),
		       points
		FROM problem_tests
		WHERE problem_id = $1
		ORDER BY ordinal;
	`
	rows, err := r.pool.Query(ctx, query, problemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []TestCaseMetadata
	for rows.Next() {
		var m TestCaseMetadata
		var inSnip, expSnip []byte
		if err := rows.Scan(
			&m.Ordinal,
			&m.InputSize,
			&m.ExpectedSize,
			&m.InputSHA,
			&m.ExpectedSHA,
			&inSnip,
			&expSnip,
			&m.Points,
		); err != nil {
			return nil, err
		}
		m.InputSnippet = string(inSnip)
		m.ExpectedSnippet = string(expSnip)
		result = append(result, m)
	}
	return result, rows.Err()
}

func (r *Repository) GetSingleTestContent(ctx context.Context, problemID string, ordinal int32, isInput bool) ([]byte, error) {
	col := "input"
	if !isInput {
		col = "expected"
	}
	query := fmt.Sprintf("SELECT %s FROM problem_tests WHERE problem_id = $1 AND ordinal = $2;", col)
	var content []byte
	err := r.pool.QueryRow(ctx, query, problemID, ordinal).Scan(&content)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return content, nil
}

func (r *Repository) AddSingleTest(ctx context.Context, problemID string, input []byte, expected []byte, points int32) (TestCaseMetadata, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return TestCaseMetadata{}, err
	}
	defer tx.Rollback(ctx)

	var nextOrd int32
	err = tx.QueryRow(ctx, `SELECT COALESCE(MAX(ordinal), 0) + 1 FROM problem_tests WHERE problem_id = $1;`, problemID).Scan(&nextOrd)
	if err != nil {
		return TestCaseMetadata{}, err
	}

	if points < 0 {
		return TestCaseMetadata{}, errors.New("test case points cannot be negative")
	}
	pts := points

	inSha := crypto.SHA256Hex(input)
	expSha := crypto.SHA256Hex(expected)

	insertQuery := `
		INSERT INTO problem_tests (problem_id, ordinal, input, expected, input_sha, expected_sha, points)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING ordinal, octet_length(input), octet_length(expected), input_sha, expected_sha, substring(input from 1 for 256), substring(expected from 1 for 256), points;
	`
	var m TestCaseMetadata
	var inSnip, expSnip []byte
	err = tx.QueryRow(ctx, insertQuery, problemID, nextOrd, input, expected, inSha, expSha, pts).Scan(
		&m.Ordinal,
		&m.InputSize,
		&m.ExpectedSize,
		&m.InputSHA,
		&m.ExpectedSHA,
		&inSnip,
		&expSnip,
		&m.Points,
	)
	if err != nil {
		return TestCaseMetadata{}, err
	}
	m.InputSnippet = string(inSnip)
	m.ExpectedSnippet = string(expSnip)

	if err := tx.Commit(ctx); err != nil {
		return TestCaseMetadata{}, err
	}
	return m, nil
}

func (r *Repository) UpdateSingleTest(ctx context.Context, problemID string, ordinal int32, input []byte, expected []byte, points *int32) (TestCaseMetadata, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return TestCaseMetadata{}, err
	}
	defer tx.Rollback(ctx)

	var currentInput, currentExpected []byte
	var currentPoints int32
	selectQuery := `SELECT input, expected, points FROM problem_tests WHERE problem_id = $1 AND ordinal = $2 FOR UPDATE;`
	err = tx.QueryRow(ctx, selectQuery, problemID, ordinal).Scan(&currentInput, &currentExpected, &currentPoints)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return TestCaseMetadata{}, ErrNotFound
		}
		return TestCaseMetadata{}, err
	}

	finalInput := currentInput
	if input != nil {
		finalInput = input
	}
	finalExpected := currentExpected
	if expected != nil {
		finalExpected = expected
	}
	finalPoints := currentPoints
	if points != nil {
		if *points < 0 {
			return TestCaseMetadata{}, errors.New("test case points cannot be negative")
		}
		finalPoints = *points
	}

	inSha := crypto.SHA256Hex(finalInput)
	expSha := crypto.SHA256Hex(finalExpected)

	updateQuery := `
		UPDATE problem_tests
		SET input = $3, expected = $4, input_sha = $5, expected_sha = $6, points = $7
		WHERE problem_id = $1 AND ordinal = $2
		RETURNING ordinal, octet_length(input), octet_length(expected), input_sha, expected_sha, substring(input from 1 for 256), substring(expected from 1 for 256), points;
	`
	var m TestCaseMetadata
	var inSnip, expSnip []byte
	err = tx.QueryRow(ctx, updateQuery, problemID, ordinal, finalInput, finalExpected, inSha, expSha, finalPoints).Scan(
		&m.Ordinal,
		&m.InputSize,
		&m.ExpectedSize,
		&m.InputSHA,
		&m.ExpectedSHA,
		&inSnip,
		&expSnip,
		&m.Points,
	)
	if err != nil {
		return TestCaseMetadata{}, err
	}
	m.InputSnippet = string(inSnip)
	m.ExpectedSnippet = string(expSnip)

	if err := tx.Commit(ctx); err != nil {
		return TestCaseMetadata{}, err
	}
	return m, nil
}

func (r *Repository) DeleteSingleTest(ctx context.Context, problemID string, ordinal int32) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	cmd, err := tx.Exec(ctx, `DELETE FROM problem_tests WHERE problem_id = $1 AND ordinal = $2;`, problemID, ordinal)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrNotFound
	}

	_, err = tx.Exec(ctx, `UPDATE problem_tests SET ordinal = ordinal - 1 WHERE problem_id = $1 AND ordinal > $2;`, problemID, ordinal)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *Repository) UpdateTestPoints(ctx context.Context, problemID string, pointsMap map[int32]int32) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	updateQuery := `UPDATE problem_tests SET points = $3 WHERE problem_id = $1 AND ordinal = $2;`
	for ord, pts := range pointsMap {
		if pts < 0 {
			return errors.New("test case points cannot be negative")
		}
		_, err := tx.Exec(ctx, updateQuery, problemID, ord, pts)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}
