package agent

import (
	"context"
	"log/slog"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Settings reads contest-day levers through an atomic snapshot so the gate never
// touches the database on the submission path.
//
// The agent policy lives in the same table, which is why it costs nothing to read:
// one query every refresh interval covers every lever and every denylist, whatever
// the size of the fleet. Reading it per request instead would put the telemetry
// ingest path in contention with submissions for pool connections to fetch a few
// hundred bytes that change perhaps twice a contest.
type Settings struct {
	pool     *pgxpool.Pool
	log      *slog.Logger
	snapshot atomic.Pointer[settingsSnapshot]
}

// settingsSnapshot is immutable once stored. Values are parsed once per reload, so
// a reader never splits a denylist string or allocates — it takes a pointer and
// reads pre-built fields.
type settingsSnapshot struct {
	values map[string]string
	policy Policy
	// degraded records that this snapshot fell back to compiled-in defaults, so
	// the condition is greppable rather than silent. An empty denylist read from a
	// broken row would disable detection with no visible symptom.
	degraded bool
}

func NewSettings(pool *pgxpool.Pool, log *slog.Logger) *Settings {
	s := &Settings{pool: pool, log: log}
	s.snapshot.Store(&settingsSnapshot{
		values:   map[string]string{},
		policy:   DefaultPolicy(),
		degraded: true,
	})
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

	// The previous snapshot is left in place on failure rather than replaced with
	// an empty one: stale policy is strictly better than no policy mid-contest.
	s.snapshot.Store(buildSnapshot(next, s.log))
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
			if err := s.Reload(ctx); err != nil && s.log != nil {
				s.log.Warn("failed to reload contest settings; keeping previous snapshot", "error", err)
			}
		}
	}
}

// Policy is the agent policy as of the last successful reload. Callers get a value
// copy of the pre-parsed struct; the slices inside are shared and must not be
// mutated.
func (s *Settings) Policy() Policy {
	return s.snapshot.Load().policy
}

// RequireAgentAttest promotes a missing loopback attestation from a review signal
// to a hard block. Ships off: it is a lever for organizers who see abuse, not a
// default that would lock out anyone whose browser can't reach loopback.
func (s *Settings) RequireAgentAttest() bool {
	return s.bool("require_agent_attest", false)
}

func (s *Settings) bool(key string, fallback bool) bool {
	switch s.snapshot.Load().values[key] {
	case "true", "1":
		return true
	case "false", "0":
		return false
	default:
		return fallback
	}
}

// buildSnapshot parses the raw rows once. Every field falls back to its
// compiled-in default independently, so one malformed row costs that one lever
// rather than the whole policy.
func buildSnapshot(values map[string]string, log *slog.Logger) *settingsSnapshot {
	defaults := DefaultPolicy()
	snapshot := &settingsSnapshot{values: values, policy: defaults}

	var missing []string
	positiveInt := func(key string, fallback int) int {
		raw, ok := values[key]
		if !ok || strings.TrimSpace(raw) == "" {
			missing = append(missing, key)
			return fallback
		}
		parsed, err := strconv.Atoi(strings.TrimSpace(raw))
		if err != nil || parsed <= 0 {
			// A zero or negative cadence would make `due()` fire on every tick or
			// divide by zero in the agent, so it is refused rather than clamped.
			missing = append(missing, key)
			return fallback
		}
		return parsed
	}

	terms := func(key string, fallback []string) []string {
		raw, ok := values[key]
		if !ok {
			missing = append(missing, key)
			return fallback
		}
		parsed := splitTerms(raw)
		if len(parsed) == 0 {
			// An empty list is indistinguishable from a truncated or cleared row and
			// would silently switch detection off, so it reads as absent. Emptying a
			// denylist deliberately means disabling its rule in proctor_rules.
			missing = append(missing, key)
			return fallback
		}
		return parsed
	}

	snapshot.policy = Policy{
		HeartbeatSeconds:    positiveInt("proctor.heartbeat_seconds", defaults.HeartbeatSeconds),
		PortProbeSeconds:    positiveInt("proctor.port_probe_seconds", defaults.PortProbeSeconds),
		KeepaliveSeconds:    positiveInt("proctor.keepalive_seconds", defaults.KeepaliveSeconds),
		RulesRefreshSeconds: positiveInt("proctor.rules_refresh_seconds", defaults.RulesRefreshSeconds),
		GateMaxStaleSeconds: positiveInt("proctor.gate_max_stale_seconds", defaults.GateMaxStaleSeconds),
		ProcessDenylist:     terms("proctor.process_denylist", defaults.ProcessDenylist),
		ForegroundDenylist:  terms("proctor.foreground_denylist", defaults.ForegroundDenylist),
	}

	if len(missing) > 0 {
		snapshot.degraded = true
		if log != nil {
			log.Warn("proctor policy fell back to compiled-in defaults", "keys", missing)
		}
	}
	return snapshot
}

// splitTerms parses a comma-separated denylist, dropping blanks and duplicates and
// lowercasing so the agent's own case-insensitive match cannot be defeated by how
// an organizer happened to type a term.
func splitTerms(raw string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, part := range strings.Split(raw, ",") {
		term := strings.ToLower(strings.TrimSpace(part))
		if term == "" || seen[term] {
			continue
		}
		seen[term] = true
		out = append(out, term)
	}
	return out
}
