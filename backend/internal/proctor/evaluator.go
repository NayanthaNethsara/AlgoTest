package proctor

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// MaxRiskScore caps the rollup. Risk is a triage order for human reviewers, not
// a quantity, and an uncapped sum makes the top of the queue meaningless.
const MaxRiskScore = 100

type Evaluator struct {
	pool *pgxpool.Pool
	log  *slog.Logger
}

func NewEvaluator(pool *pgxpool.Pool, log *slog.Logger) *Evaluator {
	return &Evaluator{pool: pool, log: log}
}

type PortObservation struct {
	Port      int    `json:"port"`
	RuleID    string `json:"rule_id"`
	Product   string `json:"product"`
	Confirmed bool   `json:"confirmed"`
}

// SignalInput is one endpoint observation, already normalized by the caller.
// proctor stays free of any dependency on the agent package so the two can
// evolve without an import cycle.
type SignalInput struct {
	UserID             string
	InternetReachable  bool
	Ports              []PortObservation
	ProcessMatches     []string
	TotalProcesses     int
	ForegroundApp      string
	ForegroundDwell    map[string]int64
	ForegroundDenylist []string
}

// ApplyEndpointSignals folds one observation into the evidence trail.
//
// Findings are *state*, not events: one open row per (user, rule) whose
// occurrence count and last_seen_at advance while the signal persists. The
// previous implementation inserted a fresh row per heartbeat, so a machine that
// merely had internet reachable accrued weight 50 every 15 seconds and every
// contestant scored HIGH within half a minute.
func (e *Evaluator) ApplyEndpointSignals(ctx context.Context, in SignalInput) error {
	if in.InternetReachable {
		e.observe(ctx, in.UserID, "net.internet", 50, map[string]any{
			"reachable": true,
			"probes":    []string{"1.1.1.1:53", "8.8.8.8:53"},
		})
	}

	for _, p := range in.Ports {
		if !p.Confirmed {
			continue // an open port without the HTTP fingerprint is any dev server
		}
		e.observe(ctx, in.UserID, p.RuleID, 40, map[string]any{
			"port":      p.Port,
			"product":   p.Product,
			"confirmed": true,
		})
	}

	if len(in.ProcessMatches) > 0 {
		e.observe(ctx, in.UserID, "ai.proc.denylist", 30, map[string]any{
			"matches": in.ProcessMatches,
			"total":   in.TotalProcesses,
		})
	}

	if app := matchForeground(in.ForegroundApp, in.ForegroundDwell, in.ForegroundDenylist); app != "" {
		e.observe(ctx, in.UserID, "ai.fg.denylist", 25, map[string]any{
			"app":      app,
			"dwell_ms": in.ForegroundDwell[app],
		})
	}

	return e.recalculateRiskScore(ctx, in.UserID)
}

// RecordEvent files a one-shot enforcement or integrity finding (sequence
// replay, machine rebind, unattested submission, clock tampering).
func (e *Evaluator) RecordEvent(ctx context.Context, userID, ruleID string, defaultWeight int, evidence map[string]any) error {
	e.observe(ctx, userID, ruleID, defaultWeight, evidence)
	return e.recalculateRiskScore(ctx, userID)
}

func (e *Evaluator) EvaluateSubmissionProvenance(
	ctx context.Context,
	userID string,
	submissionID string,
	typedChars int,
	pastedChars int,
	pasteCount int,
	largestPaste int,
) error {
	if pastedChars > typedChars && pastedChars > 200 {
		if err := e.recordSubmissionFinding(ctx, userID, submissionID, "prov.paste_dominant", 10, map[string]any{
			"typedChars":   typedChars,
			"pastedChars":  pastedChars,
			"pasteCount":   pasteCount,
			"largestPaste": largestPaste,
		}); err != nil && e.log != nil {
			e.log.Error("failed to record provenance finding", "error", err)
		}
	}
	return e.recalculateRiskScore(ctx, userID)
}

func matchForeground(app string, dwell map[string]int64, denylist []string) string {
	candidates := make([]string, 0, len(dwell)+1)
	if app != "" {
		candidates = append(candidates, app)
	}
	for k := range dwell {
		candidates = append(candidates, k)
	}
	for _, candidate := range candidates {
		lower := strings.ToLower(candidate)
		for _, term := range denylist {
			if term != "" && strings.Contains(lower, strings.ToLower(term)) {
				return candidate
			}
		}
	}
	return ""
}

// observe upserts the open finding for (user, rule). Errors are logged rather
// than returned: proctoring must never be able to fail a contestant's request.
func (e *Evaluator) observe(ctx context.Context, userID, ruleID string, defaultWeight int, evidence map[string]any) {
	weight := e.ruleWeight(ctx, ruleID, defaultWeight)
	if weight < 0 {
		return // rule disabled
	}

	evidenceBytes, err := json.Marshal(evidence)
	if err != nil {
		evidenceBytes = []byte("{}")
	}

	_, err = e.pool.Exec(ctx, `
		INSERT INTO proctor_findings (user_id, rule_id, weight, evidence, occurrences, first_seen_at, last_seen_at)
		VALUES ($1, $2, $3, $4, 1, now(), now())
		ON CONFLICT (user_id, rule_id) WHERE submission_id IS NULL
		DO UPDATE SET
			occurrences  = proctor_findings.occurrences + 1,
			last_seen_at = now(),
			weight       = EXCLUDED.weight,
			evidence     = EXCLUDED.evidence;
	`, userID, ruleID, weight, evidenceBytes)
	if err != nil && e.log != nil {
		e.log.Error("failed to record finding", "rule", ruleID, "user_id", userID, "error", err)
	}
}

func (e *Evaluator) recordSubmissionFinding(
	ctx context.Context,
	userID, submissionID, ruleID string,
	defaultWeight int,
	evidence map[string]any,
) error {
	weight := e.ruleWeight(ctx, ruleID, defaultWeight)
	if weight < 0 {
		return nil
	}

	evidenceBytes, err := json.Marshal(evidence)
	if err != nil {
		evidenceBytes = []byte("{}")
	}

	_, err = e.pool.Exec(ctx, `
		INSERT INTO proctor_findings (user_id, submission_id, rule_id, weight, evidence)
		VALUES ($1, $2, $3, $4, $5);
	`, userID, submissionID, ruleID, weight, evidenceBytes)
	return err
}

// ruleWeight returns the configured weight, -1 when the rule is disabled, or the
// compiled-in default when the catalogue has no row for it.
func (e *Evaluator) ruleWeight(ctx context.Context, ruleID string, defaultWeight int) int {
	var weight int
	var enabled bool
	err := e.pool.QueryRow(ctx, `SELECT weight, enabled FROM proctor_rules WHERE id = $1;`, ruleID).Scan(&weight, &enabled)
	if err != nil {
		return defaultWeight
	}
	if !enabled {
		return -1
	}
	return weight
}

// recalculateRiskScore recomputes the rollup: repeats grow logarithmically so a
// four-hour signal outranks a one-off without swamping every other rule, and the
// total is capped so the review queue keeps a usable order.
func (e *Evaluator) recalculateRiskScore(ctx context.Context, userID string) error {
	var totalScore int
	var count int

	err := e.pool.QueryRow(ctx, `
		SELECT
			LEAST($2, COALESCE(SUM(weight * (1 + ln(GREATEST(occurrences, 1)::numeric)))::int, 0)),
			COUNT(*)
		FROM proctor_findings
		WHERE user_id = $1;
	`, userID, MaxRiskScore).Scan(&totalScore, &count)
	if err != nil {
		return fmt.Errorf("recalculate risk score: %w", err)
	}

	severity := "LOW"
	if totalScore >= 70 {
		severity = "HIGH"
	} else if totalScore >= 30 {
		severity = "MEDIUM"
	}

	_, err = e.pool.Exec(ctx, `
		INSERT INTO proctor_risk (user_id, score, severity, finding_count, updated_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (user_id) DO UPDATE
		SET score = EXCLUDED.score,
		    severity = EXCLUDED.severity,
		    finding_count = EXCLUDED.finding_count,
		    updated_at = now();
	`, userID, totalScore, severity, count)
	return err
}
