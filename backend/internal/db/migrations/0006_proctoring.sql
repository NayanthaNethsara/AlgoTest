-- +goose Up

-- 1. Add proctor exemption flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS proctor_exempt BOOLEAN NOT NULL DEFAULT false;

-- 2. Add signal tracking columns to telemetry_heartbeats
ALTER TABLE telemetry_heartbeats 
    ADD COLUMN IF NOT EXISTS boot_id UUID,
    ADD COLUMN IF NOT EXISTS seq BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS signal_hash TEXT DEFAULT '';

-- 3. Telemetry Event History (State-change & keepalive log)
CREATE TABLE IF NOT EXISTS telemetry_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    boot_id     UUID,
    seq         BIGINT,
    event_type  TEXT NOT NULL,
    signals     JSONB NOT NULL DEFAULT '{}'::jsonb,
    signal_hash TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_user ON telemetry_events (user_id, created_at DESC);

-- 4. Disconnection Blackout Gaps
CREATE TABLE IF NOT EXISTS telemetry_gaps (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at       TIMESTAMPTZ NOT NULL,
    ended_at         TIMESTAMPTZ NOT NULL,
    duration_seconds INT NOT NULL,
    reason           TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_gaps_user ON telemetry_gaps (user_id, started_at DESC);

-- 5. Editor Provenance Metadata
CREATE TABLE IF NOT EXISTS submission_provenance (
    submission_id       UUID PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    typed_chars         INT NOT NULL DEFAULT 0,
    pasted_chars        INT NOT NULL DEFAULT 0,
    bulk_inserted_chars INT NOT NULL DEFAULT 0,
    paste_count         INT NOT NULL DEFAULT 0,
    largest_paste       INT NOT NULL DEFAULT 0,
    external_edits      INT NOT NULL DEFAULT 0,
    ms_to_first_input   INT NOT NULL DEFAULT 0,
    ms_since_last_paste INT NOT NULL DEFAULT 0,
    timeline_buckets    JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Proctor Rules Catalogue
CREATE TABLE IF NOT EXISTS proctor_rules (
    id          TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    weight      INT NOT NULL DEFAULT 10,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default proctoring rules
INSERT INTO proctor_rules (id, category, title, description, weight, enabled) VALUES
    ('net.internet', 'NETWORK', 'Internet Egress Detected', 'Machine established direct connectivity to public internet', 50, true),
    ('ai.port.ollama', 'INFERENCE', 'Ollama Local LLM Port', 'Localhost Ollama inference port 11434 answered HTTP request', 40, true),
    ('ai.port.lmstudio', 'INFERENCE', 'LM Studio Inference Port', 'Localhost LM Studio port 1234 answered HTTP request', 35, true),
    ('ai.port.jan', 'INFERENCE', 'Jan / GPT4All Inference Port', 'Localhost Jan/GPT4All port 1337 or 4891 answered HTTP request', 35, true),
    ('ai.port.llama_server', 'INFERENCE', 'llama-server / vLLM Port', 'Localhost llama-server or vLLM port 8080/8000 answered HTTP request', 35, true),
    ('ai.proc.denylist', 'PROCESS', 'AI Process Signature', 'Running process matching local LLM process denylist', 30, true),
    ('tel.no_agent_submit', 'ENFORCEMENT', 'Submission Without Agent', 'Submission attempted without active proctor agent', 25, true),
    ('tel.gap', 'TELEMETRY', 'Telemetry Blackout Gap', 'Agent telemetry connection interrupted during contest', 10, true),
    ('prov.paste_dominant', 'PROVENANCE', 'Paste Dominant Solution', 'Code submission contains predominantly pasted characters', 10, true)
ON CONFLICT (id) DO NOTHING;

-- 7. Evidence Findings
CREATE TABLE IF NOT EXISTS proctor_findings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
    rule_id       TEXT NOT NULL REFERENCES proctor_rules(id) ON DELETE CASCADE,
    weight        INT NOT NULL,
    evidence      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proctor_findings_user ON proctor_findings (user_id, created_at DESC);

-- 8. Risk Rollup
CREATE TABLE IF NOT EXISTS proctor_risk (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    score         INT NOT NULL DEFAULT 0,
    severity      TEXT NOT NULL DEFAULT 'LOW',
    finding_count INT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Admin Review Workflow
CREATE TABLE IF NOT EXISTS proctor_reviews (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    notes       TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Consent Disclosure Log
CREATE TABLE IF NOT EXISTS proctor_consents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_version TEXT NOT NULL,
    agreed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address      TEXT NOT NULL DEFAULT ''
);

-- +goose Down
DROP TABLE IF EXISTS proctor_consents;
DROP TABLE IF EXISTS proctor_reviews;
DROP TABLE IF EXISTS proctor_risk;
DROP TABLE IF EXISTS proctor_findings;
DROP TABLE IF EXISTS proctor_rules;
DROP TABLE IF EXISTS submission_provenance;
DROP TABLE IF EXISTS telemetry_gaps;
DROP TABLE IF EXISTS telemetry_events;
ALTER TABLE telemetry_heartbeats DROP COLUMN IF EXISTS boot_id, DROP COLUMN IF EXISTS seq, DROP COLUMN IF EXISTS signal_hash;
ALTER TABLE users DROP COLUMN IF EXISTS proctor_exempt;
