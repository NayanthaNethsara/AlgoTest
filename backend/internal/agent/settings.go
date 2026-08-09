package agent

import (
	"context"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Settings reads contest-day levers through an atomic snapshot so the gate never
// touches the database on the submission path.
type Settings struct {
	pool     *pgxpool.Pool
	snapshot atomic.Value // map[string]string
}

func NewSettings(pool *pgxpool.Pool) *Settings {
	s := &Settings{pool: pool}
	s.snapshot.Store(map[string]string{})
	return s
}

func (s *Settings) Reload(ctx context.Context) error {
	rows, err := s.pool.Query(ctx, `SELECT key, value FROM contest_settings;`)
	if err != nil {
		return err
	}
	defer rows.Close()

	next := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return err
		}
		next[k] = v
	}
	if err := rows.Err(); err != nil {
		return err
	}

	s.snapshot.Store(next)
	return nil
}

func (s *Settings) StartRefresher(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = s.Reload(ctx)
		}
	}
}

// RequireAgentAttest promotes a missing loopback attestation from a review signal
// to a hard block. Ships off: it is a lever for organizers who see abuse, not a
// default that would lock out anyone whose browser can't reach loopback.
func (s *Settings) RequireAgentAttest() bool {
	return s.bool("require_agent_attest", false)
}

func (s *Settings) bool(key string, fallback bool) bool {
	m, ok := s.snapshot.Load().(map[string]string)
	if !ok {
		return fallback
	}
	switch m[key] {
	case "true", "1":
		return true
	case "false", "0":
		return false
	default:
		return fallback
	}
}
