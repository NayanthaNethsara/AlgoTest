-- +goose Up
INSERT INTO contest_settings (key, value) VALUES
    ('proctor.min_client_version', '0.2.0'),
    ('proctor.enforce_binary_hash', 'false'),
    ('proctor.authorized_binary_hashes', '')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE proctor_agents ADD COLUMN IF NOT EXISTS binary_hash TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE proctor_agents DROP COLUMN IF EXISTS binary_hash;

DELETE FROM contest_settings WHERE key IN (
    'proctor.min_client_version',
    'proctor.enforce_binary_hash',
    'proctor.authorized_binary_hashes'
);
