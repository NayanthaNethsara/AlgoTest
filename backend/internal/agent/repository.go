package agent

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

const agentColumns = `id, user_id, machine_id, agent_version, platform, boot_id::text, seq,
	signal_hash, last_event_at, clock_offset_ms, loopback_port, attest_nonce,
	enrolled_at, last_seen_at, stopped_at, stopped_reason`

// Enroll issues a new enrollment and revokes any previous live one for the same
// user. A revoked enrollment on a *different* machine is reported as rebound so
// the caller can raise a finding — swapping machines mid-contest is exactly the
// move a two-laptop setup makes.
func (r *Repository) Enroll(
	ctx context.Context,
	userID, machineID, tokenHash, platform, agentVersion, consentVersion, consentIP string,
) (agentID string, rebound bool, err error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", false, fmt.Errorf("begin enroll: %w", err)
	}
	defer tx.Rollback(ctx)

	var previousMachine string
	err = tx.QueryRow(ctx, `
		SELECT machine_id FROM proctor_agents
		WHERE user_id = $1 AND revoked_at IS NULL
		FOR UPDATE;
	`, userID).Scan(&previousMachine)
	switch {
	case err == nil:
		if _, err := tx.Exec(ctx, `
			UPDATE proctor_agents
			SET revoked_at = now(), revoked_reason = 'superseded by new enrollment'
			WHERE user_id = $1 AND revoked_at IS NULL;
		`, userID); err != nil {
			return "", false, fmt.Errorf("revoke previous enrollment: %w", err)
		}
		rebound = previousMachine != machineID
	case errors.Is(err, pgx.ErrNoRows):
	default:
		return "", false, fmt.Errorf("lock previous enrollment: %w", err)
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO proctor_agents (user_id, machine_id, token_hash, platform, agent_version, consent_version)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id;
	`, userID, machineID, tokenHash, platform, agentVersion, consentVersion).Scan(&agentID)
	if err != nil {
		return "", false, fmt.Errorf("insert enrollment: %w", err)
	}

	// The consent log is append-only and outlives the enrollment it was given for.
	// proctor_agents.consent_version is overwritten by the next enrollment and is
	// deleted with the agent row, so on its own it cannot answer "what was this
	// contestant shown, and when did they agree to it" months later at an appeal.
	// Recorded in the same transaction as the enrollment: an agent that is
	// collecting without a matching consent row is the one state that must be
	// impossible.
	if _, err := tx.Exec(ctx, `
		INSERT INTO proctor_consents (user_id, consent_version, ip_address)
		VALUES ($1, $2, $3);
	`, userID, consentVersion, consentIP); err != nil {
		return "", false, fmt.Errorf("record consent: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", false, fmt.Errorf("commit enroll: %w", err)
	}
	return agentID, rebound, nil
}

// LatestConsent reports the disclosure version a contestant last agreed to, so
// organizers can see who is still running under superseded wording after the
// disclosure is edited mid-contest.
func (r *Repository) LatestConsent(ctx context.Context, userID string) (version string, agreedAt time.Time, err error) {
	err = r.pool.QueryRow(ctx, `
		SELECT consent_version, agreed_at FROM proctor_consents
		WHERE user_id = $1
		ORDER BY agreed_at DESC
		LIMIT 1;
	`, userID).Scan(&version, &agreedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", time.Time{}, nil
	}
	if err != nil {
		return "", time.Time{}, fmt.Errorf("read latest consent: %w", err)
	}
	return version, agreedAt, nil
}

func (r *Repository) GetByToken(ctx context.Context, tokenHash string) (Agent, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+agentColumns+`, revoked_at
		FROM proctor_agents WHERE token_hash = $1;
	`, tokenHash)

	var a Agent
	var revokedAt *time.Time
	err := row.Scan(&a.ID, &a.UserID, &a.MachineID, &a.AgentVersion, &a.Platform, &a.BootID, &a.Seq,
		&a.SignalHash, &a.LastEventAt, &a.ClockOffsetMs, &a.LoopbackPort, &a.AttestNonce,
		&a.EnrolledAt, &a.LastSeenAt, &a.StoppedAt, &a.StoppedReason, &revokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Agent{}, ErrUnknownAgent
	}
	if err != nil {
		return Agent{}, fmt.Errorf("load agent by token: %w", err)
	}
	if revokedAt != nil {
		return Agent{}, ErrRevoked
	}
	return a, nil
}

// RecordHeartbeat advances the agent's liveness state from a *live* heartbeat.
// Buffered replays never reach here — see Service.replay.
//
// Two deliberate details:
//
//   - The sequence counter resets when boot_id changes. It is only monotonic
//     within a boot, so keeping the old boot's maximum would make a restarted
//     agent's heartbeats read as replays and refuse them.
//   - The previous nonce is retained: the agent rotates its nonce every heartbeat,
//     so a portal that read one moments before a rotation would otherwise fail
//     attestation through no fault of its own.
func (r *Repository) RecordHeartbeat(ctx context.Context, agentID string, hb Heartbeat, clockOffsetMs int64, eventWritten bool) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE proctor_agents SET
			boot_id           = $2::uuid,
			seq               = CASE
			                      WHEN boot_id IS DISTINCT FROM $2::uuid THEN $3
			                      ELSE GREATEST(seq, $3)
			                    END,
			loopback_port     = $4,
			prev_attest_nonce = CASE WHEN $5 <> '' AND $5 <> attest_nonce THEN attest_nonce ELSE prev_attest_nonce END,
			attest_nonce      = COALESCE(NULLIF($5, ''), attest_nonce),
			agent_version     = COALESCE(NULLIF($6, ''), agent_version),
			signal_hash       = $7,
			clock_offset_ms   = $8,
			last_event_at     = CASE WHEN $9 THEN now() ELSE last_event_at END,
			last_seen_at      = now(),
			stopped_at        = NULL,
			stopped_reason    = ''
		WHERE id = $1;
	`, agentID, hb.BootID, hb.Seq, hb.LoopbackPort, hb.AttestNonce, hb.AgentVersion,
		hb.SignalHash, clockOffsetMs, eventWritten)
	if err != nil {
		return fmt.Errorf("record heartbeat: %w", err)
	}
	return nil
}

// AppendEvent writes the append-only signal history. Called only when the signal
// set actually changed or the keepalive window elapsed, which is what keeps 500
// agents at ~20k meaningful rows instead of 500k duplicates.
func (r *Repository) AppendEvent(
	ctx context.Context,
	userID, agentID, bootID, eventType, signalHash string,
	seq int64,
	signals []byte,
	observedAt time.Time,
) error {
	var boot any
	if bootID != "" {
		boot = bootID
	}
	if len(signals) == 0 {
		signals = []byte("{}")
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO telemetry_events (user_id, boot_id, seq, event_type, signals, signal_hash, created_at)
		VALUES ($1, $2::uuid, $3, $4, $5, $6, $7);
	`, userID, boot, seq, eventType, signals, signalHash, observedAt)
	if err != nil {
		return fmt.Errorf("append telemetry event: %w", err)
	}
	return nil
}

func (r *Repository) MarkStopped(ctx context.Context, agentID, reason string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE proctor_agents SET stopped_at = now(), stopped_reason = $2 WHERE id = $1;
	`, agentID, reason)
	if err != nil {
		return fmt.Errorf("mark agent stopped: %w", err)
	}
	return nil
}

func (r *Repository) Revoke(ctx context.Context, agentID, reason string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE proctor_agents SET revoked_at = now(), revoked_reason = $2
		WHERE id = $1 AND revoked_at IS NULL;
	`, agentID, reason)
	if err != nil {
		return fmt.Errorf("revoke agent: %w", err)
	}
	return nil
}

// GateState is everything the submission gate needs in one round trip.
//
// It deliberately carries no attestation nonce. The nonce's whole value is that
// it can only be read over loopback from the machine the agent runs on — serving
// it from a user-authenticated endpoint would let a second machine fetch it and
// forge co-location.
type GateState struct {
	Exempt       bool
	ExemptReason string
	HasAgent     bool
	LastSeenAt   *time.Time
	StoppedAt    *time.Time
	LoopbackPort int
	AgentVersion string
	LanIP        string
	ShellAlive   bool
	IncidentOpen bool
}

func (r *Repository) GateState(ctx context.Context, userID string) (GateState, error) {
	var s GateState
	err := r.pool.QueryRow(ctx, `
		SELECT
			u.proctor_exempt AND (u.proctor_exempt_until IS NULL OR u.proctor_exempt_until > now()),
			u.proctor_exempt_reason,
			a.id IS NOT NULL,
			a.last_seen_at,
			a.stopped_at,
			COALESCE(a.loopback_port, 0),
			COALESCE(a.agent_version, ''),
			COALESCE(h.lan_ip, ''),
			COALESCE(h.shell_alive, false),
			EXISTS (SELECT 1 FROM telemetry_incidents WHERE ended_at IS NULL)
		FROM users u
		LEFT JOIN proctor_agents a ON a.user_id = u.id AND a.revoked_at IS NULL
		LEFT JOIN telemetry_heartbeats h ON h.user_id = u.id
		WHERE u.id = $1;
	`, userID).Scan(&s.Exempt, &s.ExemptReason, &s.HasAgent, &s.LastSeenAt, &s.StoppedAt,
		&s.LoopbackPort, &s.AgentVersion, &s.LanIP, &s.ShellAlive, &s.IncidentOpen)
	if errors.Is(err, pgx.ErrNoRows) {
		return GateState{}, fmt.Errorf("user not found")
	}
	if err != nil {
		return GateState{}, fmt.Errorf("load gate state: %w", err)
	}
	return s, nil
}

type fleetHealth struct {
	Stale int
	Total int
}

func (r *Repository) fleetHealth(ctx context.Context, staleSeconds int) (fleetHealth, error) {
	var f fleetHealth
	err := r.pool.QueryRow(ctx, `
		SELECT
			count(*) FILTER (WHERE COALESCE(last_seen_at, enrolled_at) < now() - make_interval(secs => $1)),
			count(*)
		FROM proctor_agents
		WHERE revoked_at IS NULL AND stopped_at IS NULL;
	`, staleSeconds).Scan(&f.Stale, &f.Total)
	if err != nil {
		return fleetHealth{}, fmt.Errorf("fleet health: %w", err)
	}
	return f, nil
}

func (r *Repository) openGaps(ctx context.Context, staleSeconds int) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO telemetry_gaps (user_id, agent_id, started_at, reason)
		SELECT a.user_id, a.id, COALESCE(a.last_seen_at, a.enrolled_at), 'agent_unreachable'
		FROM proctor_agents a
		WHERE a.revoked_at IS NULL
		  AND a.stopped_at IS NULL
		  AND COALESCE(a.last_seen_at, a.enrolled_at) < now() - make_interval(secs => $1)
		ON CONFLICT (user_id) WHERE ended_at IS NULL DO NOTHING;
	`, staleSeconds)
	if err != nil {
		return 0, fmt.Errorf("open gaps: %w", err)
	}
	return tag.RowsAffected(), nil
}

func (r *Repository) closeGaps(ctx context.Context, staleSeconds int) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE telemetry_gaps g
		SET ended_at = now(),
		    duration_seconds = GREATEST(1, EXTRACT(EPOCH FROM now() - g.started_at)::int)
		WHERE g.ended_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM proctor_agents a
			WHERE a.user_id = g.user_id
			  AND a.revoked_at IS NULL
			  AND (a.stopped_at IS NOT NULL
			       OR COALESCE(a.last_seen_at, a.enrolled_at) >= now() - make_interval(secs => $1))
		  );
	`, staleSeconds)
	if err != nil {
		return 0, fmt.Errorf("close gaps: %w", err)
	}
	return tag.RowsAffected(), nil
}

// discardGapsInIncident deletes gaps opened inside a server-side outage. The
// blackout was ours, so it must leave no contestant-attributed evidence.
func (r *Repository) discardGapsInIncident(ctx context.Context) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM telemetry_gaps g
		WHERE g.ended_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM telemetry_incidents i
			WHERE i.ended_at IS NULL AND g.started_at >= i.started_at - interval '60 seconds'
		  );
	`)
	if err != nil {
		return 0, fmt.Errorf("discard incident gaps: %w", err)
	}
	return tag.RowsAffected(), nil
}

func (r *Repository) openIncident(ctx context.Context, affected, enrolled int) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO telemetry_incidents (started_at, affected_agents, enrolled_agents, note)
		SELECT now(), $1, $2, 'fleet-wide heartbeat loss; contestant gaps suppressed'
		WHERE NOT EXISTS (SELECT 1 FROM telemetry_incidents WHERE ended_at IS NULL);
	`, affected, enrolled)
	if err != nil {
		return false, fmt.Errorf("open incident: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

func (r *Repository) closeIncident(ctx context.Context) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE telemetry_incidents SET ended_at = now() WHERE ended_at IS NULL;
	`)
	if err != nil {
		return false, fmt.Errorf("close incident: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

func (r *Repository) IncidentOpen(ctx context.Context) (bool, error) {
	var open bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM telemetry_incidents WHERE ended_at IS NULL);`).Scan(&open)
	if err != nil {
		return false, fmt.Errorf("check incident: %w", err)
	}
	return open, nil
}

// VerifyNonce reports whether nonce matches the live agent of userID, accepting
// the previous value too so a rotation between reading and submitting doesn't
// fail an honest contestant.
func (r *Repository) VerifyNonce(ctx context.Context, userID, nonce string) (bool, error) {
	if nonce == "" {
		return false, nil
	}
	var match bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM proctor_agents
			WHERE user_id = $1 AND revoked_at IS NULL
			  AND $2 <> '' AND $2 IN (attest_nonce, prev_attest_nonce)
		);
	`, userID, nonce).Scan(&match)
	if err != nil {
		return false, fmt.Errorf("verify attestation nonce: %w", err)
	}
	return match, nil
}
