-- +goose Up
ALTER TABLE proctor_agents ADD COLUMN IF NOT EXISTS binary_hash TEXT NOT NULL DEFAULT '';

INSERT INTO contest_settings (key, value) VALUES
    ('min_client_version', '0.2.0')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM contest_settings WHERE key = 'min_client_version';
ALTER TABLE proctor_agents DROP COLUMN IF EXISTS binary_hash;
