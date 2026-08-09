package agent

import (
	"context"
	"fmt"
	"time"
)

// Fleet is the contest-day scoreboard for proctoring itself: how many clients are
// reporting, how many have gone dark, and whether the cause looks like us.
type Fleet struct {
	Competitors   int `json:"competitors"`
	Enrolled      int `json:"enrolled"`
	Online        int `json:"online"`
	Stale         int `json:"stale"`
	Offline       int `json:"offline"`
	NeverReported int `json:"neverReported"`
	InGap         int `json:"inGap"`
	Stopped       int `json:"stopped"`
	BrowserActive int `json:"browserActive"`
	Exempt        int `json:"exempt"`
	HighRisk      int `json:"highRisk"`
	MediumRisk    int `json:"mediumRisk"`
}

type Incident struct {
	ID              string     `json:"id"`
	StartedAt       time.Time  `json:"startedAt"`
	EndedAt         *time.Time `json:"endedAt,omitempty"`
	AffectedAgents  int        `json:"affectedAgents"`
	EnrolledAgents  int        `json:"enrolledAgents"`
	Note            string     `json:"note"`
	DurationSeconds int        `json:"durationSeconds"`
}

type Overview struct {
	Fleet    Fleet     `json:"fleet"`
	Incident *Incident `json:"incident"`
}

// Overview answers "is everyone reporting?" in one round trip. Counting in SQL
// rather than over a shipped list is what lets this poll every 10s with 500
// contestants without the admin tab becoming the heaviest client on the network.
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

// latestIncident returns the open outage, or the most recent one if it closed
// within the last fifteen minutes — an organizer still needs to know a blackout
// just ended when they are reading gaps that were suppressed during it.
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
