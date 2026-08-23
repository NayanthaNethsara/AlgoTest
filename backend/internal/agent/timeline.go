package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// Entry kinds on the review timeline.
const (
	KindEvent      = "event"
	KindGap        = "gap"
	KindFinding    = "finding"
	KindSubmission = "submission"
	KindEnrollment = "enrollment"
)

// Entry is one moment on a contestant's timeline. The kinds share one shape so the
// UI can render a single ordered axis: "Ollama appeared 14:03 · blackout 14:05–14:07
// · submission with four typed characters at 14:08" is a story an organizer can act
// on. Three separate tables is not.
type Entry struct {
	Kind    string          `json:"kind"`
	At      time.Time       `json:"at"`
	EndedAt *time.Time      `json:"endedAt,omitempty"`
	Label   string          `json:"label"`
	Detail  string          `json:"detail,omitempty"`
	Weight  int             `json:"weight,omitempty"`
	Count   int             `json:"count,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type Timeline struct {
	UserID      string  `json:"userId"`
	Username    string  `json:"username"`
	DisplayName string  `json:"displayName"`
	TeamName    *string `json:"teamName,omitempty"`
	Score       int     `json:"score"`
	Severity    string  `json:"severity"`
	SupportHint string  `json:"supportHint"`
	Entries     []Entry `json:"entries"`
}

// Timeline assembles one contestant's evidence in time order.
//
// The union runs in SQL rather than four round trips merged in Go: the ordering is
// the product, and doing it in one query means the LIMIT applies to the merged
// stream instead of truncating each source independently.
func (r *Repository) Timeline(ctx context.Context, userID string, limit int) (Timeline, error) {
	if limit <= 0 || limit > 500 {
		limit = 250
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

			-- A deliberate stop belongs on the axis at the moment it happened, not
			-- folded into the enrollment row hours earlier. "Stopped proctoring at
			-- 14:02, submitted at 14:04" is the sequence an organizer is looking for.
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
