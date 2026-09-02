package agent

import (
	"context"
	"fmt"
	"time"
)

type CompetitorRiskItem struct {
	UserID        string
	Username      string
	DisplayName   string
	ProctorExempt bool
	Score         int
	Severity      string
	FindingCount  int
	LastPingAt    *time.Time
	AllowWebOnly  bool
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

type FindingItem struct {
	ID           string
	RuleID       string
	Title        string
	Category     string
	Weight       int
	Occurrences  int
	Evidence     any
	SubmissionID *string
	FirstSeenAt  time.Time
	LastSeenAt   time.Time
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

type AgentItem struct {
	ID            string
	UserID        string
	Username      string
	DisplayName   string
	MachineID     string
	Platform      string
	AgentVersion  string
	LoopbackPort  int
	EnrolledAt    time.Time
	LastSeenAt    *time.Time
	StoppedAt     *time.Time
	StoppedReason string
	RevokedAt     *time.Time
	RevokedReason string
	InGap         bool
}

func (r *Repository) ListAgents(ctx context.Context) ([]AgentItem, error) {
	query := `
		SELECT a.id, u.id, u.username, u.display_name, a.machine_id, a.platform,
		       a.agent_version, a.loopback_port, a.enrolled_at, a.last_seen_at,
		       a.stopped_at, a.stopped_reason, a.revoked_at, a.revoked_reason,
		       EXISTS (SELECT 1 FROM telemetry_gaps g WHERE g.user_id = u.id AND g.ended_at IS NULL)
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
			&item.RevokedAt, &item.RevokedReason, &item.InGap,
		); err != nil {
			return nil, fmt.Errorf("scan agent item: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
