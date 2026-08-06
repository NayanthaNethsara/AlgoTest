package proctor

import (
	"errors"
	"time"
)

var (
	ErrAgentStale = errors.New("proctor agent inactive or stale")
)

const (
	ProctorGateMaxStaleSeconds = 90
)

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
	Evidence     map[string]interface{} `json:"evidence"`
	CreatedAt    time.Time              `json:"createdAt"`
}

type RiskRollup struct {
	UserID       string    `json:"userId"`
	Score        int       `json:"score"`
	Severity     string    `json:"severity"`
	FindingCount int       `json:"findingCount"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type GateStatus struct {
	Allowed          bool       `json:"allowed"`
	Exempt           bool       `json:"exempt"`
	LastPingAt       *time.Time `json:"lastPingAt,omitempty"`
	SecondsSincePing int        `json:"secondsSincePing"`
}
