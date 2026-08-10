package telemetry

import (
	"time"
)

type Status string

const (
	StatusOnline  Status = "ONLINE"
	StatusStale   Status = "STALE"
	StatusOffline Status = "OFFLINE"
)

type ClientType string

const (
	ClientTypeDesktop ClientType = "DESKTOP"
	ClientTypeWeb     ClientType = "WEB"
	ClientTypeNone    ClientType = "NONE"
)

type Heartbeat struct {
	UserID            string     `json:"user_id"`
	Username          string     `json:"username"`
	DisplayName       string     `json:"display_name"`
	TeamID            *string    `json:"team_id,omitempty"`
	TeamName          *string    `json:"team_name,omitempty"`
	ActiveWindow      string     `json:"active_window"`
	OSInfo            string     `json:"os_info"`
	IPAddress         string     `json:"ip_address"`
	AgentVersion      string     `json:"agent_version"`
	ShellAlive        bool       `json:"shell_alive"`
	InternetReachable bool       `json:"internet_reachable"`
	ProcessMatches    []string   `json:"process_matches"`
	ClientType        ClientType `json:"client_type"`
	LastPingAt        time.Time  `json:"last_ping_at"`
	Status            Status     `json:"status"`
	Enrolled          bool       `json:"enrolled"`
	OfflineSeconds    int        `json:"offline_seconds"`
	InGap             bool       `json:"in_gap"`
	GapStartedAt      *time.Time `json:"gap_started_at,omitempty"`
	StoppedReason     string     `json:"stopped_reason"`
	RiskScore         int        `json:"risk_score"`
	Severity          string     `json:"severity"`
	ProctorExempt     bool       `json:"proctor_exempt"`
}

// AgentRow is the agent-owned lane of a contestant's heartbeat row.
type AgentRow struct {
	UserID            string
	AgentID           string
	AgentVersion      string
	ActiveWindow      string
	ForegroundDwell   map[string]int64
	Ports             []byte
	InternetReachable bool
	ProcessMatches    []string
	TotalProcesses    int
	LanIP             string
	ShellAlive        bool
	OSInfo            string
	IPAddress         string
	BootID            string
	Seq               int64
	SignalHash        string
	LastPingAt        time.Time
}

// WebRow is the browser-owned lane. It carries no signals and never touches
// agent liveness — the browser is a fallback UI, not a source of truth.
type WebRow struct {
	UserID     string
	IPAddress  string
	UserAgent  string
	TabVisible bool
}

// WebPingRequest is what the portal sends from a browser. Deliberately minimal:
// anything richer would be forgeable client-side and is already covered by the
// agent on the endpoint.
type WebPingRequest struct {
	TabVisible bool   `json:"tab_visible"`
	OSInfo     string `json:"os_info"`
}

// CalculateStatus grades agent liveness. The 45s boundary is three heartbeats;
// the submission gate uses a more forgiving threshold so a single congested-LAN
// drop can't lock someone out mid-submit.
func CalculateStatus(lastPingAt time.Time, now time.Time) Status {
	elapsed := now.Sub(lastPingAt)
	if elapsed <= 45*time.Second {
		return StatusOnline
	}
	if elapsed <= 2*time.Minute {
		return StatusStale
	}
	return StatusOffline
}
