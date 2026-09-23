-- +goose Up
CREATE TABLE telemetry_heartbeats (
    user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    team_id           UUID REFERENCES teams(id) ON DELETE SET NULL,
    active_window     TEXT NOT NULL DEFAULT '',
    running_processes TEXT[] NOT NULL DEFAULT '{}',
    os_info           TEXT NOT NULL DEFAULT '',
    ip_address        TEXT NOT NULL DEFAULT '',
    last_ping_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telemetry_team ON telemetry_heartbeats (team_id);
CREATE INDEX idx_telemetry_last_ping ON telemetry_heartbeats (last_ping_at);

-- +goose Down
DROP TABLE telemetry_heartbeats;
