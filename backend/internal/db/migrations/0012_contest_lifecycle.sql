-- +goose Up
INSERT INTO contest_settings (key, value) VALUES
    ('contest.title', 'MiniAlgothon 2026'),
    ('contest.status', 'NOT_STARTED'),
    ('contest.duration_seconds', '7200'),
    ('contest.freeze_minutes', '30'),
    ('contest.start_time', ''),
    ('contest.end_time', ''),
    ('contest.paused_at', '')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM contest_settings WHERE key LIKE 'contest.%';
