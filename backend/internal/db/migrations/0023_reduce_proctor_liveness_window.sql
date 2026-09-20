-- +goose Up
-- Only replace the former defaults so organizer-defined values remain intact.
UPDATE contest_settings
SET value = '10'
WHERE key = 'proctor.heartbeat_seconds' AND value = '15';

UPDATE contest_settings
SET value = '20'
WHERE key = 'proctor.gate_max_stale_seconds' AND value = '90';

-- +goose Down
UPDATE contest_settings
SET value = '15'
WHERE key = 'proctor.heartbeat_seconds' AND value = '10';

UPDATE contest_settings
SET value = '90'
WHERE key = 'proctor.gate_max_stale_seconds' AND value = '20';
