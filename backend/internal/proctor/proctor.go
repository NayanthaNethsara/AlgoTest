// Package proctor turns endpoint observations into an evidence trail an
// organizer can act on. It decides nothing about access — the submission gate
// lives in internal/agent, next to the liveness state it depends on.
package proctor

import "time"

type Rule struct {
	ID          string    `json:"id"`
	Category    string    `json:"category"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Weight      int       `json:"weight"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Finding struct {
	ID           string                 `json:"id"`
	UserID       string                 `json:"userId"`
	SubmissionID *string                `json:"submissionId,omitempty"`
	RuleID       string                 `json:"ruleId"`
	Weight       int                    `json:"weight"`
	Occurrences  int                    `json:"occurrences"`
	Evidence     map[string]interface{} `json:"evidence"`
	FirstSeenAt  time.Time              `json:"firstSeenAt"`
	LastSeenAt   time.Time              `json:"lastSeenAt"`
	CreatedAt    time.Time              `json:"createdAt"`
}

type RiskRollup struct {
	UserID       string    `json:"userId"`
	Score        int       `json:"score"`
	Severity     string    `json:"severity"`
	FindingCount int       `json:"findingCount"`
	UpdatedAt    time.Time `json:"updatedAt"`
}
