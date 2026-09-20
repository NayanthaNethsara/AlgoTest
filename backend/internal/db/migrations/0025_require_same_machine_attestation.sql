-- +goose Up
UPDATE contest_settings
SET value = 'true', updated_at = now()
WHERE key = 'require_agent_attest' AND value = 'false';

INSERT INTO contest_settings (key, value)
VALUES ('require_agent_attest', 'true')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
UPDATE contest_settings
SET value = 'false', updated_at = now()
WHERE key = 'require_agent_attest' AND value = 'true';
