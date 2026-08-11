package proctor

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// MaxRiskScore caps the rollup. Risk is a triage order for human reviewers, not
// a quantity, and an uncapped sum makes the top of the queue meaningless.
const MaxRiskScore = 100

type Evaluator struct {
	pool *pgxpool.Pool
	log  *slog.Logger
	// rules is the catalogue, cached so a heartbeat that fires three rules costs
	// three writes rather than three writes and three lookups. Refreshed on a
	// timer: one query regardless of fleet size, against a path that all 300
	// agents can hit in the same second when a shared condition changes.
	rules atomic.Pointer[map[string]ruleConfig]
}

type ruleConfig struct {
	weight  int
	enabled bool
}

func NewEvaluator(pool *pgxpool.Pool, log *slog.Logger) *Evaluator {
	return &Evaluator{pool: pool, log: log}
}

// ReloadRules refreshes the cached rule catalogue.
func (e *Evaluator) ReloadRules(ctx context.Context) error {
	rows, err := e.pool.Query(ctx, `SELECT id, weight, enabled FROM proctor_rules;`)
	if err != nil {
		return fmt.Errorf("load rule catalogue: %w", err)
	}
	defer rows.Close()

	next := map[string]ruleConfig{}
	for rows.Next() {
		var id string
		var cfg ruleConfig
		if err := rows.Scan(&id, &cfg.weight, &cfg.enabled); err != nil {
			return fmt.Errorf("scan rule: %w", err)
		}
		next[id] = cfg
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read rules: %w", err)
	}

	// Never publish an empty catalogue over a populated one. Every rule would fall
	// back to its compiled-in weight, which silently re-enables rules an organizer
	// had turned off — the opposite of what a failed read should do.
	if len(next) == 0 && e.rules.Load() != nil {
		return fmt.Errorf("rule catalogue came back empty; keeping previous")
	}

	e.rules.Store(&next)
	return nil
}

func (e *Evaluator) StartRulesRefresher(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := e.ReloadRules(ctx); err != nil && e.log != nil {
				e.log.Warn("failed to refresh rule catalogue; keeping previous", "error", err)
			}
		}
	}
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

	terms := make([][]string, 0, len(denylist))
	for _, term := range denylist {
		if tokens := tokenize(term); len(tokens) > 0 {
			terms = append(terms, tokens)
		}
	}

	for _, candidate := range candidates {
		tokens := tokenize(candidate)
		for _, term := range terms {
			if matchesTerm(tokens, term) {
				return candidate
			}
		}
	}
	return ""
}

// tokenize splits on every non-alphanumeric character, lowercasing as it goes.
//
// This must stay behaviourally identical to tokenize() in the agent's
// signals/processes.rs. The two run over different inputs — bundle identifiers here,
// process names and command lines there — but a term means the same thing in both,
// and organizers edit one list that feeds both.
func tokenize(value string) []string {
	return strings.FieldsFunc(strings.ToLower(value), func(r rune) bool {
		return !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'))
	})
}

// matchesTerm reports whether the term's tokens appear as a contiguous run in the
// candidate's, making a denylist term a word rather than a substring.
//
// Substring matching was the bug this replaces: `strings.Contains` on `jan` fired
// against anything containing those three letters. An empty term matches nothing —
// a typo in an organizer-editable table must not become a match-everything rule.
func matchesTerm(candidate, term []string) bool {
	if len(term) == 0 || len(term) > len(candidate) {
		return false
	}
	for i := 0; i+len(term) <= len(candidate); i++ {
		if slices.Equal(candidate[i:i+len(term)], term) {
			return true
		}
	}
	return false
}

// observe upserts the open finding for (user, rule). Errors are logged rather
// than returned: proctoring must never be able to fail a contestant's request.
func (e *Evaluator) observe(ctx context.Context, userID, ruleID string, defaultWeight int, evidence map[string]any) {
	weight := e.ruleWeight(ruleID, defaultWeight)
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
	weight := e.ruleWeight(ruleID, defaultWeight)
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
//
// Reads the cached catalogue rather than the database. This runs once per firing
// rule inside heartbeat ingest, and that path is reached by the whole fleet at once
// whenever a shared condition changes — venue wi-fi returning flips
// internet_reachable for every contestant in the same second.
func (e *Evaluator) ruleWeight(ruleID string, defaultWeight int) int {
	cached := e.rules.Load()
	if cached == nil {
		// Not loaded yet. Matches the old behaviour on a failed read: score with the
		// compiled-in weight rather than dropping the observation.
		return defaultWeight
	}
	cfg, ok := (*cached)[ruleID]
	if !ok {
		return defaultWeight
	}
	if !cfg.enabled {
		return -1
	}
	return cfg.weight
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
