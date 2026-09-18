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
	enrolled_at, last_seen_at, stopped_at, stopped_reason, binary_hash`

func (r *Repository) Enroll(
	ctx context.Context,
	userID, machineID, tokenHash, platform, agentVersion, consentVersion, binaryHash, consentIP string,
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
		INSERT INTO proctor_agents (user_id, machine_id, token_hash, platform, agent_version, consent_version, binary_hash)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id;
	`, userID, machineID, tokenHash, platform, agentVersion, consentVersion, binaryHash).Scan(&agentID)
	if err != nil {
		return "", false, fmt.Errorf("insert enrollment: %w", err)
	}

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
		&a.EnrolledAt, &a.LastSeenAt, &a.StoppedAt, &a.StoppedReason, &a.BinaryHash, &revokedAt)
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
	ShellSeenAt  *time.Time
	IncidentOpen bool
	Grant        AccessGrant
	AccessReason string
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
			h.shell_alive_at,
			EXISTS (SELECT 1 FROM telemetry_incidents WHERE ended_at IS NULL),
			u.proctor_allow_web_only AND (u.proctor_access_until IS NULL OR u.proctor_access_until > now()),
			CASE WHEN u.proctor_access_until IS NULL OR u.proctor_access_until > now()
			     THEN u.proctor_access_reason ELSE '' END
		FROM users u
		LEFT JOIN proctor_agents a ON a.user_id = u.id AND a.revoked_at IS NULL
		LEFT JOIN telemetry_heartbeats h ON h.user_id = u.id
		WHERE u.id = $1;
	`, userID).Scan(&s.Exempt, &s.ExemptReason, &s.HasAgent, &s.LastSeenAt, &s.StoppedAt,
		&s.LoopbackPort, &s.AgentVersion, &s.LanIP, &s.ShellAlive, &s.ShellSeenAt,
		&s.IncidentOpen, &s.Grant.WebOnly, &s.AccessReason)
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

func (r *Repository) Overview(ctx context.Context) (Overview, error) {
	var o Overview

	err := r.pool.QueryRow(ctx, `
		SELECT
			count(*),
			count(a.id),
			count(*) FILTER (WHERE h.last_ping_at >= now() - interval '45 seconds'),
			count(*) FILTER (WHERE h.last_ping_at <  now() - interval '45 seconds'
			                   AND h.last_ping_at >= now() - interval '2 minutes'),
			count(*) FILTER (WHERE h.last_ping_at <  now() - interval '2 minutes'),
			count(*) FILTER (WHERE a.id IS NOT NULL AND h.last_ping_at IS NULL),
			count(*) FILTER (WHERE g.user_id IS NOT NULL),
			count(*) FILTER (WHERE a.stopped_at IS NOT NULL),
			count(*) FILTER (WHERE h.web_last_ping_at >= now() - interval '45 seconds'),
			count(*) FILTER (WHERE u.proctor_exempt
			                   AND (u.proctor_exempt_until IS NULL OR u.proctor_exempt_until > now())),
			count(*) FILTER (WHERE risk.severity = 'HIGH'),
			count(*) FILTER (WHERE risk.severity = 'MEDIUM')
		FROM users u
		LEFT JOIN proctor_agents a ON a.user_id = u.id AND a.revoked_at IS NULL
		LEFT JOIN telemetry_heartbeats h ON h.user_id = u.id
		LEFT JOIN telemetry_gaps g ON g.user_id = u.id AND g.ended_at IS NULL
		LEFT JOIN proctor_risk risk ON risk.user_id = u.id
		WHERE u.role = 'competitor';
	`).Scan(
		&o.Fleet.Competitors, &o.Fleet.Enrolled, &o.Fleet.Online, &o.Fleet.Stale, &o.Fleet.Offline,
		&o.Fleet.NeverReported, &o.Fleet.InGap, &o.Fleet.Stopped, &o.Fleet.BrowserActive,
		&o.Fleet.Exempt, &o.Fleet.HighRisk, &o.Fleet.MediumRisk,
	)
	if err != nil {
		return Overview{}, fmt.Errorf("fleet overview: %w", err)
	}

	incident, err := r.latestIncident(ctx)
	if err != nil {
		return Overview{}, err
	}
	o.Incident = incident

	return o, nil
}

func (r *Repository) latestIncident(ctx context.Context) (*Incident, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, started_at, ended_at, affected_agents, enrolled_agents, note,
		       GREATEST(1, EXTRACT(EPOCH FROM COALESCE(ended_at, now()) - started_at)::int)
		FROM telemetry_incidents
		WHERE ended_at IS NULL OR ended_at > now() - interval '15 minutes'
		ORDER BY started_at DESC
		LIMIT 1;
	`)
	if err != nil {
		return nil, fmt.Errorf("latest incident: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, rows.Err()
	}

	var i Incident
	if err := rows.Scan(&i.ID, &i.StartedAt, &i.EndedAt, &i.AffectedAgents,
		&i.EnrolledAgents, &i.Note, &i.DurationSeconds); err != nil {
		return nil, fmt.Errorf("scan incident: %w", err)
	}
	return &i, nil
}

func (r *Repository) Timeline(ctx context.Context, userID string, limit int) (Timeline, error) {
	if limit <= 0 {
		limit = 250
	}
	if limit > 1000 {
		limit = 1000
	}

	var t Timeline
	err := r.pool.QueryRow(ctx, `
		SELECT u.id, u.username, u.display_name, tm.name,
		       COALESCE(risk.score, 0), COALESCE(risk.severity, 'LOW'),
		       COALESCE(a.machine_id, '')
		FROM users u
		LEFT JOIN teams tm ON tm.id = u.team_id
		LEFT JOIN proctor_risk risk ON risk.user_id = u.id
		LEFT JOIN proctor_agents a ON a.user_id = u.id AND a.revoked_at IS NULL
		WHERE u.id = $1;
	`, userID).Scan(&t.UserID, &t.Username, &t.DisplayName, &t.TeamName,
		&t.Score, &t.Severity, &t.SupportHint)
	if err != nil {
		return Timeline{}, fmt.Errorf("load timeline subject: %w", err)
	}

	rows, err := r.pool.Query(ctx, `
		WITH merged AS (
			SELECT 'event'::text AS kind, e.created_at AS at, NULL::timestamptz AS ended_at,
			       e.event_type AS label, ''::text AS detail, 0 AS weight, 0 AS count,
			       e.signals AS payload
			FROM telemetry_events e
			WHERE e.user_id = $1

			UNION ALL
			SELECT 'gap', g.started_at, g.ended_at,
			       g.reason, ''::text, 0, COALESCE(g.duration_seconds, 0),
			       '{}'::jsonb
			FROM telemetry_gaps g
			WHERE g.user_id = $1

			UNION ALL
			SELECT 'finding', f.last_seen_at, NULL::timestamptz,
			       f.rule_id, rl.title, f.weight, f.occurrences,
			       f.evidence
			FROM proctor_findings f
			JOIN proctor_rules rl ON rl.id = f.rule_id
			WHERE f.user_id = $1

			UNION ALL
			SELECT 'submission', s.created_at, s.finished_at,
			       p.title, COALESCE(s.verdict, s.state), s.score, 0,
			       jsonb_build_object(
			           'submission_id', s.id,
			           'language', s.language,
			           'max_score', s.max_score
			       )
			FROM submissions s
			JOIN problems p ON p.id = s.problem_id
			WHERE s.user_id = $1

			UNION ALL
			SELECT 'enrollment', a.enrolled_at, a.revoked_at,
			       a.platform,
			       CASE
			           WHEN a.revoked_at IS NOT NULL THEN 'revoked: ' || a.revoked_reason
			           ELSE 'active'
			       END,
			       0, 0,
			       jsonb_build_object('machine_id', a.machine_id, 'agent_version', a.agent_version)
			FROM proctor_agents a
			WHERE a.user_id = $1

			UNION ALL
			SELECT 'event', a.stopped_at, NULL::timestamptz,
			       'agent_stopped', a.stopped_reason, 0, 0,
			       '{}'::jsonb
			FROM proctor_agents a
			WHERE a.user_id = $1 AND a.stopped_at IS NOT NULL
		)
		SELECT kind, at, ended_at, label, detail, weight, count, payload
		FROM merged
		ORDER BY at DESC
		LIMIT $2;
	`, userID, limit)
	if err != nil {
		return Timeline{}, fmt.Errorf("query timeline: %w", err)
	}
	defer rows.Close()

	t.Entries = []Entry{}
	for rows.Next() {
		var e Entry
		var payload []byte
		if err := rows.Scan(&e.Kind, &e.At, &e.EndedAt, &e.Label, &e.Detail,
			&e.Weight, &e.Count, &payload); err != nil {
			return Timeline{}, fmt.Errorf("scan timeline entry: %w", err)
		}
		if len(payload) > 0 && string(payload) != "{}" {
			e.Payload = payload
		}
		t.Entries = append(t.Entries, e)
	}
	if err := rows.Err(); err != nil {
		return Timeline{}, fmt.Errorf("iterate timeline: %w", err)
	}

	describeEvents(t.Entries)

	return t, nil
}

func (r *Repository) ListProctorRisk(ctx context.Context) ([]CompetitorRiskItem, error) {
	query := `
		SELECT u.id, u.username, u.display_name, u.proctor_exempt,
		       COALESCE(r.score, 0) as score,
		       COALESCE(r.severity, 'LOW') as severity,
		       COALESCE(r.finding_count, 0) as finding_count,
		       h.last_ping_at,
		       u.proctor_allow_web_only AND (u.proctor_access_until IS NULL OR u.proctor_access_until > now())
		FROM users u
		LEFT JOIN proctor_risk r ON u.id = r.user_id
		LEFT JOIN telemetry_heartbeats h ON u.id = h.user_id
		WHERE u.role = 'competitor'
		ORDER BY r.score DESC NULLS LAST, u.username ASC;
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list proctor risk: %w", err)
	}
	defer rows.Close()

	var items []CompetitorRiskItem
	for rows.Next() {
		var item CompetitorRiskItem
		if err := rows.Scan(
			&item.UserID, &item.Username, &item.DisplayName, &item.ProctorExempt,
			&item.Score, &item.Severity, &item.FindingCount, &item.LastPingAt,
			&item.AllowWebOnly,
		); err != nil {
			return nil, fmt.Errorf("scan proctor risk item: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) GetProctorFindings(ctx context.Context, userID string) ([]FindingItem, error) {
	query := `
		SELECT f.id, f.rule_id, r.title, r.category, f.weight, f.occurrences,
		       f.evidence, f.submission_id, f.first_seen_at, f.last_seen_at
		FROM proctor_findings f
		JOIN proctor_rules r ON f.rule_id = r.id
		WHERE f.user_id = $1
		ORDER BY f.last_seen_at DESC;
	`
	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("get proctor findings: %w", err)
	}
	defer rows.Close()

	var items []FindingItem
	for rows.Next() {
		var item FindingItem
		if err := rows.Scan(
			&item.ID, &item.RuleID, &item.Title, &item.Category, &item.Weight,
			&item.Occurrences, &item.Evidence, &item.SubmissionID, &item.FirstSeenAt, &item.LastSeenAt,
		); err != nil {
			return nil, fmt.Errorf("scan proctor finding item: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) ListAgents(ctx context.Context) ([]AgentItem, error) {
	query := `
		SELECT a.id, u.id, u.username, u.display_name, a.machine_id, a.platform,
		       a.agent_version, a.loopback_port, a.enrolled_at, a.last_seen_at,
		       a.stopped_at, a.stopped_reason, a.revoked_at, a.revoked_reason,
		       EXISTS (SELECT 1 FROM telemetry_gaps g WHERE g.user_id = u.id AND g.ended_at IS NULL),
		       COALESCE(a.binary_hash, '')
		FROM proctor_agents a
		JOIN users u ON u.id = a.user_id
		ORDER BY a.revoked_at NULLS FIRST, a.last_seen_at DESC NULLS LAST;
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}
	defer rows.Close()

	var items []AgentItem
	for rows.Next() {
		var item AgentItem
		if err := rows.Scan(
			&item.ID, &item.UserID, &item.Username, &item.DisplayName,
			&item.MachineID, &item.Platform, &item.AgentVersion, &item.LoopbackPort,
			&item.EnrolledAt, &item.LastSeenAt, &item.StoppedAt, &item.StoppedReason,
			&item.RevokedAt, &item.RevokedReason, &item.InGap, &item.BinaryHash,
		); err != nil {
			return nil, fmt.Errorf("scan agent item: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) ClearLockoutFindings(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM proctor_findings WHERE user_id = $1 AND rule_id IN ('web.lockout_exceeded', 'web.fullscreen_exit');
	`, userID)
	if err != nil {
		return fmt.Errorf("clear lockout findings: %w", err)
	}
	return nil
}

func (r *Repository) UnrevokeAgent(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE proctor_agents 
		SET revoked_at = NULL, revoked_reason = '', stopped_at = NULL, stopped_reason = ''
		WHERE user_id = $1;
	`, userID)
	if err != nil {
		return fmt.Errorf("unrevoke agent: %w", err)
	}
	return nil
}
