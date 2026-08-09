-- +goose Up

-- 1. Agent identity. The proctor agent holds its own credential so liveness no
-- longer depends on a portal login in the desktop webview.
CREATE TABLE IF NOT EXISTS proctor_agents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    machine_id      TEXT NOT NULL,
    token_hash      TEXT NOT NULL UNIQUE,
    agent_version   TEXT NOT NULL DEFAULT '',
    platform        TEXT NOT NULL DEFAULT '',
    consent_version TEXT NOT NULL DEFAULT '',
    boot_id         UUID,
    seq             BIGINT NOT NULL DEFAULT 0,
    signal_hash     TEXT NOT NULL DEFAULT '',
    last_event_at   TIMESTAMPTZ,
    clock_offset_ms BIGINT,
    loopback_port   INT NOT NULL DEFAULT 0,
    attest_nonce    TEXT NOT NULL DEFAULT '',
    prev_attest_nonce TEXT NOT NULL DEFAULT '',
    enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ,
    stopped_at      TIMESTAMPTZ,
    stopped_reason  TEXT NOT NULL DEFAULT '',
    revoked_at      TIMESTAMPTZ,
    revoked_reason  TEXT NOT NULL DEFAULT ''
);

-- At most one live agent per contestant; re-enrolling elsewhere must revoke the old one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_proctor_agents_live
    ON proctor_agents (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_proctor_agents_history
    ON proctor_agents (user_id, enrolled_at DESC);

-- 2. Heartbeat rows carry which agent sent them and the signals the evaluator
-- needs. The agent lane and the browser lane are separate columns: both write to
-- the same user row, and a browser ping must not be able to overwrite or refresh
-- anything the agent owns.
ALTER TABLE telemetry_heartbeats
    ADD COLUMN IF NOT EXISTS agent_id           UUID REFERENCES proctor_agents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS agent_version      TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS shell_alive        BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS internet_reachable BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS lan_ip             TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS foreground_dwell   JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS ports              JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS web_last_ping_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS web_ip             TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS web_user_agent     TEXT NOT NULL DEFAULT '';

-- client_type was never written by the live batcher path, so every contestant
-- read as DESKTOP. Which client is active is derived from the two lanes above.
ALTER TABLE telemetry_heartbeats DROP COLUMN IF EXISTS client_type;

-- "no agent has ever reported" must be representable, or a browser-only
-- contestant inherits DEFAULT now() and reads as a live desktop agent.
ALTER TABLE telemetry_heartbeats
    ALTER COLUMN last_ping_at DROP NOT NULL,
    ALTER COLUMN last_ping_at DROP DEFAULT;

-- last_ping_at changes on every heartbeat, so indexing it is what prevents HOT
-- updates on a 500-row table. Drop it and let autovacuum keep up instead.
DROP INDEX IF EXISTS idx_telemetry_last_ping;
ALTER TABLE telemetry_heartbeats SET (
    fillfactor = 70,
    autovacuum_vacuum_scale_factor = 0.0,
    autovacuum_vacuum_threshold = 500
);

-- 3. Gaps need to exist while still open, so the sweeper can close them later
-- and the review timeline can show an ongoing blackout.
ALTER TABLE telemetry_gaps
    ALTER COLUMN ended_at DROP NOT NULL,
    ALTER COLUMN duration_seconds DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES proctor_agents(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_gaps_open
    ON telemetry_gaps (user_id) WHERE ended_at IS NULL;

-- 4. Server-side outage windows. A nginx reload must not read as 300 contestant gaps.
CREATE TABLE IF NOT EXISTS telemetry_incidents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    affected_agents INT NOT NULL DEFAULT 0,
    enrolled_agents INT NOT NULL DEFAULT 0,
    note            TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_window
    ON telemetry_incidents (started_at DESC);

-- 5. Endpoint findings collapse to one open row per (user, rule) with an
-- occurrence count. Without this a reachable-internet signal inserts a fresh
-- weight-50 row every 15s and every risk score runs away.
ALTER TABLE proctor_findings
    ADD COLUMN IF NOT EXISTS occurrences   INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_proctor_findings_open
    ON proctor_findings (user_id, rule_id) WHERE submission_id IS NULL;

-- 6. Rules referenced by the agent and the new gate. ai.port.kobold was already
-- emitted by the client with no row here, so its findings failed the rule FK.
INSERT INTO proctor_rules (id, category, title, description, weight, enabled) VALUES
    ('ai.port.kobold', 'INFERENCE', 'KoboldCpp / text-gen-webui Port', 'Localhost KoboldCpp or text-generation-webui port answered HTTP request', 35, true),
    ('ai.fg.denylist', 'PROCESS', 'AI App In Foreground', 'A denylisted local LLM application held keyboard focus', 25, true),
    ('tel.web_client', 'TELEMETRY', 'Browser Fallback In Use', 'Contestant submitted from the web portal rather than the desktop shell', 15, true),
    ('tel.no_attest', 'ENFORCEMENT', 'Unattested Submission', 'Submission carried no loopback attestation from the live agent', 20, true),
    ('tel.agent_rebound', 'ENFORCEMENT', 'Agent Re-enrolled On New Machine', 'A second machine enrolled an agent for this contestant, revoking the first', 30, true),
    ('tel.agent_crash', 'TELEMETRY', 'Agent Restarted Without Shutdown', 'Agent reappeared with a new boot id and no clean shutdown', 10, true),
    ('tel.seq_replay', 'ENFORCEMENT', 'Heartbeat Sequence Replay', 'Heartbeat sequence regressed within one agent boot', 60, true),
    ('tel.clock_skew', 'TELEMETRY', 'Endpoint Clock Tampering', 'Wall clock diverged from the agent monotonic clock', 20, true),
    ('tel.exempt', 'ENFORCEMENT', 'Proctoring Exemption Granted', 'Contestant submits under an administrator exemption', 15, true)
ON CONFLICT (id) DO NOTHING;

-- 7. Exemptions become break-glass: reasoned, attributed, and expiring.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS proctor_exempt_reason     TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS proctor_exempt_until      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS proctor_exempt_granted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 8. Contest-day levers, read through a cached atomic value.
CREATE TABLE IF NOT EXISTS contest_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO contest_settings (key, value) VALUES
    ('require_agent_attest', 'false')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS contest_settings;

ALTER TABLE users
    DROP COLUMN IF EXISTS proctor_exempt_reason,
    DROP COLUMN IF EXISTS proctor_exempt_until,
    DROP COLUMN IF EXISTS proctor_exempt_granted_by;

DELETE FROM proctor_rules WHERE id IN (
    'ai.port.kobold', 'ai.fg.denylist', 'tel.web_client', 'tel.no_attest',
    'tel.agent_rebound', 'tel.agent_crash', 'tel.seq_replay', 'tel.clock_skew', 'tel.exempt'
);

DROP INDEX IF EXISTS idx_proctor_findings_open;
ALTER TABLE proctor_findings
    DROP COLUMN IF EXISTS occurrences,
    DROP COLUMN IF EXISTS first_seen_at,
    DROP COLUMN IF EXISTS last_seen_at;

DROP TABLE IF EXISTS telemetry_incidents;

DROP INDEX IF EXISTS idx_telemetry_gaps_open;
DELETE FROM telemetry_gaps WHERE ended_at IS NULL;
ALTER TABLE telemetry_gaps
    DROP COLUMN IF EXISTS agent_id,
    ALTER COLUMN ended_at SET NOT NULL,
    ALTER COLUMN duration_seconds SET NOT NULL;

ALTER TABLE telemetry_heartbeats RESET (
    fillfactor,
    autovacuum_vacuum_scale_factor,
    autovacuum_vacuum_threshold
);
CREATE INDEX IF NOT EXISTS idx_telemetry_last_ping ON telemetry_heartbeats (last_ping_at);

UPDATE telemetry_heartbeats SET last_ping_at = now() WHERE last_ping_at IS NULL;
ALTER TABLE telemetry_heartbeats
    ALTER COLUMN last_ping_at SET DEFAULT now(),
    ALTER COLUMN last_ping_at SET NOT NULL,
    ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'DESKTOP',
    DROP COLUMN IF EXISTS agent_id,
    DROP COLUMN IF EXISTS agent_version,
    DROP COLUMN IF EXISTS shell_alive,
    DROP COLUMN IF EXISTS internet_reachable,
    DROP COLUMN IF EXISTS lan_ip,
    DROP COLUMN IF EXISTS foreground_dwell,
    DROP COLUMN IF EXISTS ports,
    DROP COLUMN IF EXISTS web_last_ping_at,
    DROP COLUMN IF EXISTS web_ip,
    DROP COLUMN IF EXISTS web_user_agent;

DROP TABLE IF EXISTS proctor_agents;
