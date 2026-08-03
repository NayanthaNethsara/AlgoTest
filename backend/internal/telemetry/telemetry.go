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
)

type Heartbeat struct {
	UserID           string     `json:"user_id"`
	Username         string     `json:"username"`
	DisplayName      string     `json:"display_name"`
	TeamID           *string    `json:"team_id,omitempty"`
	TeamName         *string    `json:"team_name,omitempty"`
	ActiveWindow     string     `json:"active_window"`
	RunningProcesses []string   `json:"running_processes"`
	OSInfo           string     `json:"os_info"`
	IPAddress        string     `json:"ip_address"`
	ClientType       ClientType `json:"client_type"`
	LastPingAt       time.Time  `json:"last_ping_at"`
	Status           Status     `json:"status"`
}

type PingRequest struct {
	ActiveWindow     string     `json:"active_window"`
	RunningProcesses []string   `json:"running_processes"`
	OSInfo           string     `json:"os_info"`
	ClientType       ClientType `json:"client_type"`
}

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
