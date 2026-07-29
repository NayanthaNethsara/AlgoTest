-- name: ListPublishedProblems :many
SELECT * FROM problems WHERE published = true ORDER BY created_at DESC;

-- name: ListAllProblems :many
SELECT * FROM problems ORDER BY created_at DESC;

-- name: GetProblemBySlug :one
SELECT * FROM problems WHERE slug = $1;

-- name: GetPublishedProblemBySlug :one
SELECT * FROM problems WHERE slug = $1 AND published = true;

-- name: GetProblemByID :one
SELECT * FROM problems WHERE id = $1;

-- name: CreateProblem :one
INSERT INTO problems (slug, title, difficulty, statement, constraints, time_limit_ms, memory_limit_mb, max_score, published)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: UpdateProblem :one
UPDATE problems
SET title = $2, difficulty = $3, statement = $4, constraints = $5, time_limit_ms = $6, memory_limit_mb = $7, max_score = $8, published = $9, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: SetProblemPublished :execrows
UPDATE problems SET published = $2, updated_at = now() WHERE id = $1;

-- name: DeleteProblem :execrows
DELETE FROM problems WHERE id = $1;

-- name: GetSamplesForProblem :many
SELECT * FROM problem_samples WHERE problem_id = $1 ORDER BY ordinal;

-- name: DeleteSamplesForProblem :exec
DELETE FROM problem_samples WHERE problem_id = $1;

-- name: CreateSample :one
INSERT INTO problem_samples (problem_id, ordinal, input, output, explanation)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetTestsForProblem :many
SELECT id, problem_id, ordinal, input_sha, expected_sha, points FROM problem_tests WHERE problem_id = $1 ORDER BY ordinal;

-- name: GetFullTestsForProblem :many
SELECT * FROM problem_tests WHERE problem_id = $1 ORDER BY ordinal;

-- name: DeleteTestsForProblem :exec
DELETE FROM problem_tests WHERE problem_id = $1;

-- name: CreateTest :one
INSERT INTO problem_tests (problem_id, ordinal, input, expected, input_sha, expected_sha, points)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;
