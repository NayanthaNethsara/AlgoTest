-- +goose Up
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS is_rejudge BOOLEAN NOT NULL DEFAULT false;

-- +goose StatementBegin
DO $$
DECLARE
    retired INT;
BEGIN
    WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY team_id, problem_id
                   ORDER BY created_at DESC, id DESC
               ) AS rn
        FROM submissions
        WHERE state IN ('queued', 'running') AND NOT is_rejudge
    )
    UPDATE submissions s
    SET state = 'failed',
        verdict = COALESCE(s.verdict, 'IE'),
        finished_at = COALESCE(s.finished_at, now()),
        claimed_at = NULL,
        claimed_by = NULL,
        lease_until = NULL
    FROM ranked
    WHERE s.id = ranked.id AND ranked.rn > 1;

    GET DIAGNOSTICS retired = ROW_COUNT;
    IF retired > 0 THEN
        RAISE NOTICE 'retired % duplicate active submission(s)', retired;
    END IF;
END
$$;
-- +goose StatementEnd

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_active_team_problem
ON submissions (team_id, problem_id)
WHERE state IN ('queued', 'running') AND NOT is_rejudge;

CREATE INDEX IF NOT EXISTS idx_problem_scores_user
ON problem_scores (user_id);

CREATE INDEX IF NOT EXISTS idx_submissions_team_state
ON submissions (team_id, state);

CREATE INDEX IF NOT EXISTS idx_submissions_finished
ON submissions (finished_at)
WHERE state = 'passed';

ALTER TABLE submission_tests ADD COLUMN IF NOT EXISTS max_points INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE submission_tests DROP COLUMN IF EXISTS max_points;
DROP INDEX IF EXISTS idx_submissions_finished;
DROP INDEX IF EXISTS idx_submissions_team_state;
DROP INDEX IF EXISTS idx_problem_scores_user;
DROP INDEX IF EXISTS idx_submissions_active_team_problem;
ALTER TABLE submissions DROP COLUMN IF EXISTS is_rejudge;
