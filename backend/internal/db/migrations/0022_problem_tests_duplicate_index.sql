-- +goose Up
CREATE INDEX IF NOT EXISTS idx_problem_tests_hashes
ON problem_tests (problem_id, input_sha, expected_sha);

-- +goose Down
DROP INDEX IF EXISTS idx_problem_tests_hashes;
