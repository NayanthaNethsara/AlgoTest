-- +goose Up
-- +goose StatementBegin
DO $$
DECLARE
    problem_record RECORD;
    total_test_count INT;
    base_points INT;
    remainder_points INT;
BEGIN
    FOR problem_record IN SELECT id, max_score FROM problems LOOP
        SELECT COUNT(*) INTO total_test_count FROM problem_tests WHERE problem_id = problem_record.id;
        IF total_test_count > 0 AND (SELECT COALESCE(SUM(points), 0) FROM problem_tests WHERE problem_id = problem_record.id) = 0 THEN
            base_points := problem_record.max_score / total_test_count;
            remainder_points := problem_record.max_score % total_test_count;

            WITH ranked_tests AS (
                SELECT id, ROW_NUMBER() OVER (ORDER BY ordinal ASC) AS row_num
                FROM problem_tests
                WHERE problem_id = problem_record.id
            )
            UPDATE problem_tests pt
            SET points = base_points + (CASE WHEN rt.row_num <= remainder_points THEN 1 ELSE 0 END)
            FROM ranked_tests rt
            WHERE pt.id = rt.id;
        END IF;
    END LOOP;
END $$;
-- +goose StatementEnd

-- +goose Down
-- Points distribution does not need reversal on downgrade.
