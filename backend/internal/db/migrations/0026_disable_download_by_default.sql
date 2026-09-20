-- +goose Up
INSERT INTO contest_settings (key, value)
VALUES ('download.enabled', 'false')
ON CONFLICT (key) DO UPDATE
SET value = 'false', updated_at = now();

-- +goose Down
UPDATE contest_settings
SET value = 'true', updated_at = now()
WHERE key = 'download.enabled';
