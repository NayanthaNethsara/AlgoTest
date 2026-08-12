-- +goose Up

-- Three ways to sit the contest, one of them free.
--
-- Working inside the desktop client with a live agent is what every account gets,
-- which is why there is no column for it. The browser fallbacks — with an agent
-- still reporting, or with no agent at all — are real, supported paths, but each
-- costs observability, so each is a decision an organizer makes and signs.
--
-- Two independent flags rather than one ranked level: an organizer may need to allow
-- a machine that cannot run the client at all without thereby blessing "browser
-- while the agent runs" for the same person. See internal/agent/access.go, which
-- also names the one perverse combination (web-only without web-with-agent, which
-- rewards stopping the agent) that the admin console warns about.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS proctor_allow_web_with_agent BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS proctor_allow_web_only       BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS proctor_access_reason        TEXT NOT NULL DEFAULT '',
    -- NULL means "for the rest of the contest". Unlike an exemption, which is
    -- break-glass and expires within hours, a browser grant usually answers a
    -- machine that will still be broken tomorrow.
    ADD COLUMN IF NOT EXISTS proctor_access_until         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS proctor_access_granted_by    UUID REFERENCES users(id) ON DELETE SET NULL;

-- Partial: both flags are false for all but a handful of accounts, and the admin
-- console's only question of them is who holds a grant.
CREATE INDEX IF NOT EXISTS idx_users_proctor_access_granted
    ON users (proctor_allow_web_with_agent, proctor_allow_web_only)
    WHERE proctor_allow_web_with_agent OR proctor_allow_web_only;

-- When the desktop shell was last seen, as distinct from whether the newest
-- heartbeat happened to catch it.
--
-- `shell_alive` is a snapshot: the shell pings the agent every 10s and the agent
-- forgets it after 30s, so a laptop resuming from sleep or a shell stalled under
-- load produces one heartbeat that says false. Deriving access from that snapshot
-- alone would refuse a contestant who is doing everything right, which is the worst
-- possible failure for this gate — so the gate reads the timestamp with a grace
-- window instead. See ShellGraceSeconds in internal/agent/gate.go.
ALTER TABLE telemetry_heartbeats
    ADD COLUMN IF NOT EXISTS shell_alive_at TIMESTAMPTZ;

-- Backfill so contestants already working in the client are not downgraded the
-- moment this deploys: their current report is as good as a fresh sighting.
UPDATE telemetry_heartbeats SET shell_alive_at = last_ping_at
WHERE shell_alive AND shell_alive_at IS NULL;

-- The contest-wide floor, one switch per fallback. Turning one on opens that path
-- for everyone at once, which is the right lever when the desktop client itself is
-- the problem; the per-user columns above stay available for the individual
-- accommodation. A contestant gets the union of the two.
INSERT INTO contest_settings (key, value) VALUES
    ('access.allow_web_with_agent', 'false'),
    ('access.allow_web_only', 'false')
ON CONFLICT (key) DO NOTHING;

-- Submitting under a browser-only grant is not misconduct — an organizer allowed
-- it — but it is the one case where no endpoint signal exists at all, so it belongs
-- in the review timeline the same way an exemption does, at the same weight.
INSERT INTO proctor_rules (id, category, title, description, weight, enabled) VALUES
    ('tel.web_only_grant', 'ENFORCEMENT', 'Submission Under Browser-Only Grant',
     'Contestant submitted from a browser with no live proctor agent, under an administrator grant', 15, true)
ON CONFLICT (id) DO NOTHING;

-- +goose Down

DELETE FROM proctor_rules WHERE id = 'tel.web_only_grant';
DELETE FROM contest_settings WHERE key IN ('access.allow_web_with_agent', 'access.allow_web_only');

ALTER TABLE telemetry_heartbeats DROP COLUMN IF EXISTS shell_alive_at;

DROP INDEX IF EXISTS idx_users_proctor_access_granted;
ALTER TABLE users
    DROP COLUMN IF EXISTS proctor_allow_web_with_agent,
    DROP COLUMN IF EXISTS proctor_allow_web_only,
    DROP COLUMN IF EXISTS proctor_access_reason,
    DROP COLUMN IF EXISTS proctor_access_until,
    DROP COLUMN IF EXISTS proctor_access_granted_by;
