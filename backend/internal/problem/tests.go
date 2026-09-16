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
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(result) > 0 {
		allZero := true
		for _, t := range result {
			if t.Points > 0 {
				allZero = false
				break
			}
		}
		if allZero {
			var maxScore int32
			if err := r.pool.QueryRow(ctx, `SELECT max_score FROM problems WHERE id = $1;`, problemID).Scan(&maxScore); err == nil && maxScore > 0 {
				base := maxScore / int32(len(result))
				remainder := int(maxScore % int32(len(result)))
				for i := range result {
					result[i].Points = base
					if i < remainder {
						result[i].Points++
					}
				}
			}
		}
	}

	return result, nil
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
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(result) > 0 {
		allZero := true
		for _, m := range result {
			if m.Points > 0 {
				allZero = false
				break
			}
		}
		if allZero {
			var maxScore int32
			if err := r.pool.QueryRow(ctx, `SELECT max_score FROM problems WHERE id = $1;`, problemID).Scan(&maxScore); err == nil && maxScore > 0 {
				base := maxScore / int32(len(result))
				remainder := int(maxScore % int32(len(result)))
				for i := range result {
					result[i].Points = base
					if i < remainder {
						result[i].Points++
					}
					_, _ = r.pool.Exec(ctx, `UPDATE problem_tests SET points = $1 WHERE problem_id = $2 AND ordinal = $3;`, result[i].Points, problemID, result[i].Ordinal)
				}
			}
		}
	}

	return result, nil
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

func DistributeProblemPointsTx(ctx context.Context, tx pgx.Tx, problemID string, maxScore int32) error {
	rows, err := tx.Query(ctx, `SELECT id FROM problem_tests WHERE problem_id = $1 ORDER BY ordinal ASC;`, problemID)
	if err != nil {
		return err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(ids) == 0 || maxScore <= 0 {
		return nil
	}

	base := maxScore / int32(len(ids))
	remainder := int(maxScore % int32(len(ids)))
	for i, id := range ids {
		pts := base
		if i < remainder {
			pts++
		}
		if _, err := tx.Exec(ctx, `UPDATE problem_tests SET points = $1 WHERE id = $2;`, pts, id); err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) AddSingleTest(ctx context.Context, problemID string, input []byte, expected []byte, points int32) (TestCaseMetadata, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return TestCaseMetadata{}, err
	}
	defer tx.Rollback(ctx)

	var maxScore int32
	if err := tx.QueryRow(ctx, `SELECT max_score FROM problems WHERE id = $1 FOR UPDATE;`, problemID).Scan(&maxScore); err != nil {
		return TestCaseMetadata{}, fmt.Errorf("read problem max_score: %w", err)
	}

	var nextOrd int32
	err = tx.QueryRow(ctx, `SELECT COALESCE(MAX(ordinal), 0) + 1 FROM problem_tests WHERE problem_id = $1;`, problemID).Scan(&nextOrd)
	if err != nil {
		return TestCaseMetadata{}, err
	}

	if points < 0 {
		return TestCaseMetadata{}, errors.New("test case points cannot be negative")
	}

	rows, err := tx.Query(ctx, `SELECT points FROM problem_tests WHERE problem_id = $1 ORDER BY ordinal ASC;`, problemID)
	if err != nil {
		return TestCaseMetadata{}, err
	}
	var currentSum int32
	var existingPoints []int32
	for rows.Next() {
		var p int32
		if err := rows.Scan(&p); err != nil {
			rows.Close()
			return TestCaseMetadata{}, err
		}
		existingPoints = append(existingPoints, p)
		currentSum += p
	}
	rows.Close()

	shouldAutoDistribute := points <= 0 && IsEvenDistribution(existingPoints, maxScore)
	pts := points
	if shouldAutoDistribute {
		pts = 0
	} else if points > 0 && currentSum+points > maxScore {
		return TestCaseMetadata{}, fmt.Errorf("adding %d points exceeds problem max score of %d (current sum: %d)", points, maxScore, currentSum)
	}

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

	if shouldAutoDistribute {
		if err := DistributeProblemPointsTx(ctx, tx, problemID, maxScore); err != nil {
			return TestCaseMetadata{}, fmt.Errorf("auto distribute points: %w", err)
		}
		if err := tx.QueryRow(ctx, `SELECT points FROM problem_tests WHERE problem_id = $1 AND ordinal = $2;`, problemID, nextOrd).Scan(&m.Points); err != nil {
			return TestCaseMetadata{}, err
		}
	}

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

	var maxScore int32
	if err := tx.QueryRow(ctx, `SELECT max_score FROM problems WHERE id = $1 FOR UPDATE;`, problemID).Scan(&maxScore); err != nil {
		return fmt.Errorf("read problem max_score: %w", err)
	}

	rows, err := tx.Query(ctx, `SELECT points FROM problem_tests WHERE problem_id = $1 ORDER BY ordinal ASC;`, problemID)
	if err != nil {
		return err
	}
	var existingPoints []int32
	for rows.Next() {
		var p int32
		if err := rows.Scan(&p); err != nil {
			rows.Close()
			return err
		}
		existingPoints = append(existingPoints, p)
	}
	rows.Close()

	wasEven := IsEvenDistribution(existingPoints, maxScore)

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

	if wasEven {
		if err := DistributeProblemPointsTx(ctx, tx, problemID, maxScore); err != nil {
			return fmt.Errorf("auto distribute points after delete: %w", err)
		}
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
