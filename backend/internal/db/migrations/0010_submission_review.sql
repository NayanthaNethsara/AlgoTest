-- +goose Up

-- Review is an override on top of scoring, never a gate in front of it.
--
-- A submission is judged, scored and on the board the moment it finishes; an
-- organizer may afterwards reject it, which takes its points back out. The reverse
-- order — points appearing only once a human has cleared them — would mean no live
-- scoreboard for the length of the contest, which is the thing the scoreboard is
-- for. So the default is 'accepted' and the column exists to record the exception.
ALTER TABLE submissions
    ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'accepted',
    ADD COLUMN IF NOT EXISTS review_reason TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reviewed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ;

-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'submissions_review_status_check'
    ) THEN
        ALTER TABLE submissions
            ADD CONSTRAINT submissions_review_status_check
            CHECK (review_status IN ('accepted', 'rejected'));
    END IF;
END
$$;
-- +goose StatementEnd

-- Partial: rejection is the rare case, and the only question asked of the column
-- in bulk is which (team, problem) pairs need their best score recomputed.
CREATE INDEX IF NOT EXISTS idx_submissions_rejected
    ON submissions (team_id, problem_id)
    WHERE review_status = 'rejected';

-- The status column carries the current answer; this carries how it got there.
-- A rejection that moved a team off the top of the board is exactly the decision
-- that gets challenged afterwards, so who did it, when, and why is kept per change
-- rather than only in its latest state.
CREATE TABLE IF NOT EXISTS submission_reviews (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    reviewer_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    from_status   TEXT NOT NULL,
    to_status     TEXT NOT NULL,
    reason        TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submission_reviews_submission
    ON submission_reviews (submission_id, created_at DESC);

-- +goose Down

DROP TABLE IF EXISTS submission_reviews;
DROP INDEX IF EXISTS idx_submissions_rejected;
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_review_status_check;
ALTER TABLE submissions
    DROP COLUMN IF EXISTS review_status,
    DROP COLUMN IF EXISTS review_reason,
    DROP COLUMN IF EXISTS reviewed_by,
    DROP COLUMN IF EXISTS reviewed_at;
