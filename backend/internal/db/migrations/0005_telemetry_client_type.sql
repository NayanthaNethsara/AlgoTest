-- +goose Up
ALTER TABLE telemetry_heartbeats ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'DESKTOP';

-- +goose Down
ALTER TABLE telemetry_heartbeats DROP COLUMN IF EXISTS client_type;
