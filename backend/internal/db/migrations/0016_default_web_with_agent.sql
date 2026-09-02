-- +goose Up
-- Migration 0016: Drop redundant proctor_allow_web_with_agent column and setting
ALTER TABLE users DROP COLUMN IF EXISTS proctor_allow_web_with_agent;
DELETE FROM contest_settings WHERE key = 'access.allow_web_with_agent';

-- +goose Down
ALTER TABLE users ADD COLUMN IF NOT EXISTS proctor_allow_web_with_agent BOOLEAN NOT NULL DEFAULT false;
INSERT INTO contest_settings (key, value) VALUES ('access.allow_web_with_agent', 'false') ON CONFLICT (key) DO NOTHING;
