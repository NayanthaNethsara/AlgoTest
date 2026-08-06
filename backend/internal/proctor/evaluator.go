package proctor

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/telemetry"
)

type Evaluator struct {
	pool *pgxpool.Pool
	log  *slog.Logger
}

func NewEvaluator(pool *pgxpool.Pool, log *slog.Logger) *Evaluator {
	return &Evaluator{pool: pool, log: log}
}

// EvaluateTelemetryPing processes incoming signals from desktop client.
func (e *Evaluator) EvaluateTelemetryPing(ctx context.Context, userID string, req telemetry.PingRequest) error {
	if req.Signals == nil {
		return nil
	}

	signals := req.Signals

	// 1. Internet egress
	if signals.InternetReachable {
		if err := e.recordFinding(ctx, userID, nil, "net.internet", 50, map[string]interface{}{
			"reachable": true,
			"target":    "1.1.1.1:53",
		}); err != nil && e.log != nil {
			e.log.Error("failed to record internet finding", "error", err)
		}
	}

	// 2. Port match signals
	for _, portMatch := range signals.Ports {
		if portMatch.Confirmed {
			if err := e.recordFinding(ctx, userID, nil, portMatch.RuleID, 40, map[string]interface{}{
				"port":      portMatch.Port,
				"product":   portMatch.Product,
				"confirmed": true,
			}); err != nil && e.log != nil {
				e.log.Error("failed to record port finding", "error", err)
			}
		}
	}

	// 3. Process matches
	if len(signals.ProcessMatches) > 0 {
		if err := e.recordFinding(ctx, userID, nil, "ai.proc.denylist", 30, map[string]interface{}{
			"matches": signals.ProcessMatches,
			"total":   signals.TotalProcesses,
		}); err != nil && e.log != nil {
			e.log.Error("failed to record process finding", "error", err)
		}
	}

	// 4. Update risk score rollup
	return e.recalculateRiskScore(ctx, userID)
}

// EvaluateSubmissionProvenance inspects code insertion metrics on submission.
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
		if err := e.recordFinding(ctx, userID, &submissionID, "prov.paste_dominant", 15, map[string]interface{}{
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

func (e *Evaluator) recordFinding(
	ctx context.Context,
	userID string,
	submissionID *string,
	ruleID string,
	defaultWeight int,
	evidence map[string]interface{},
) error {
	var weight int
	err := e.pool.QueryRow(ctx, `SELECT weight FROM proctor_rules WHERE id = $1 AND enabled = true;`, ruleID).Scan(&weight)
	if err != nil {
		weight = defaultWeight
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

func (e *Evaluator) recalculateRiskScore(ctx context.Context, userID string) error {
	var totalScore int
	var count int

	err := e.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(weight), 0), COUNT(*)
		FROM proctor_findings
		WHERE user_id = $1;
	`, userID).Scan(&totalScore, &count)
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
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (user_id) DO UPDATE
		SET score = EXCLUDED.score,
		    severity = EXCLUDED.severity,
		    finding_count = EXCLUDED.finding_count,
		    updated_at = NOW();
	`, userID, totalScore, severity, count)
	return err
}
