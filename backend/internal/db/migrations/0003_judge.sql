-- +goose Up
CREATE TABLE problems (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    difficulty      TEXT NOT NULL,
    statement       TEXT NOT NULL,
    constraints     TEXT NOT NULL DEFAULT '',
    time_limit_ms   INTEGER NOT NULL DEFAULT 4000,
    memory_limit_mb INTEGER NOT NULL DEFAULT 256,
    max_score       INTEGER NOT NULL,
    published       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE problem_samples (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id  UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    ordinal     INTEGER NOT NULL,
    input       TEXT NOT NULL,
    output      TEXT NOT NULL,
    explanation TEXT NOT NULL DEFAULT '',
    UNIQUE (problem_id, ordinal)
);

CREATE TABLE problem_tests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id   UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    ordinal      INTEGER NOT NULL,
    input        BYTEA NOT NULL,
    expected     BYTEA NOT NULL,
    input_sha    TEXT NOT NULL,
    expected_sha TEXT NOT NULL,
    points       INTEGER NOT NULL DEFAULT 1,
    UNIQUE (problem_id, ordinal)
);

CREATE TABLE submissions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id    UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    language      TEXT NOT NULL,
    code          TEXT NOT NULL,
    state         TEXT NOT NULL DEFAULT 'queued',
    verdict       TEXT,
    score         INTEGER NOT NULL DEFAULT 0,
    max_score     INTEGER NOT NULL,
    tests_total   INTEGER NOT NULL,
    tests_done    INTEGER NOT NULL DEFAULT 0,
    compile_error TEXT,
    max_time_ms   INTEGER NOT NULL DEFAULT 0,
    max_memory_kb INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_at    TIMESTAMPTZ,
    claimed_by    TEXT,
    lease_until   TIMESTAMPTZ,
    attempts      INTEGER NOT NULL DEFAULT 0,
    finished_at   TIMESTAMPTZ
);

CREATE INDEX idx_submissions_queued ON submissions (created_at) WHERE state = 'queued';
CREATE INDEX idx_submissions_lease  ON submissions (lease_until) WHERE state = 'running';
CREATE INDEX idx_submissions_team   ON submissions (team_id, problem_id, created_at DESC);
CREATE INDEX idx_submissions_user   ON submissions (user_id, problem_id, created_at DESC);

CREATE TABLE submission_tests (
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    ordinal       INTEGER NOT NULL,
    verdict       TEXT NOT NULL,
    time_ms       INTEGER NOT NULL,
    memory_kb     INTEGER NOT NULL,
    points        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (submission_id, ordinal)
);

CREATE TABLE problem_scores (
    team_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    problem_id         UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
    best_score         INTEGER NOT NULL,
    best_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, problem_id)
);

-- +goose Down
DROP TABLE problem_scores;
DROP TABLE submission_tests;
DROP TABLE submissions;
DROP TABLE problem_tests;
DROP TABLE problem_samples;
DROP TABLE problems;
