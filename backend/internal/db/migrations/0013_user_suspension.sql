-- +goose Up
ALTER TABLE users ADD COLUMN is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN suspended_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN suspended_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE users DROP COLUMN suspended_at;
ALTER TABLE users DROP COLUMN suspended_reason;
ALTER TABLE users DROP COLUMN is_suspended;
