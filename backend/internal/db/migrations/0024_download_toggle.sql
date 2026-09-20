-- +goose Up
INSERT INTO contest_settings (key, value) VALUES
    ('download.enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM contest_settings WHERE key = 'download.enabled';
