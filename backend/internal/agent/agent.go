// Package agent owns the proctor agent's own identity. The agent enrolls once
// and holds a long-lived credential of its own, so liveness never depends on a
// portal login inside the desktop webview — which is what lets the browser act
// as a genuine fallback instead of a proctoring bypass.
package agent

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"
)

var (
	ErrUnknownAgent = errors.New("agent token not recognised")
	ErrRevoked      = errors.New("agent enrollment revoked")
)

// GateMaxStaleSeconds is deliberately above three missed heartbeats. At the 45s
// StatusOnline boundary a single congested-LAN drop locks someone out mid-submit.
const GateMaxStaleSeconds = 90

// ClockSkewToleranceMs is how far the wall clock may drift from the agent's
// monotonic clock across one heartbeat before it reads as tampering.
const ClockSkewToleranceMs = 120_000

type Agent struct {
	ID            string     `json:"id"`
	UserID        string     `json:"userId"`
	MachineID     string     `json:"machineId"`
	AgentVersion  string     `json:"agentVersion"`
	Platform      string     `json:"platform"`
	BootID        *string    `json:"bootId,omitempty"`
	Seq           int64      `json:"seq"`
	SignalHash    string     `json:"signalHash"`
	LastEventAt   *time.Time `json:"lastEventAt,omitempty"`
	ClockOffsetMs *int64     `json:"clockOffsetMs,omitempty"`
	LoopbackPort  int        `json:"loopbackPort"`
	AttestNonce   string     `json:"-"`
	EnrolledAt    time.Time  `json:"enrolledAt"`
	LastSeenAt    *time.Time `json:"lastSeenAt,omitempty"`
	StoppedAt     *time.Time `json:"stoppedAt,omitempty"`
	StoppedReason string     `json:"stoppedReason,omitempty"`
}

// Policy is everything the agent needs to run that organizers may want to
// change without rebuilding and redistributing 300 binaries.
type Policy struct {
	HeartbeatSeconds    int      `json:"heartbeat_seconds"`
	PortProbeSeconds    int      `json:"port_probe_seconds"`
	KeepaliveSeconds    int      `json:"keepalive_seconds"`
	RulesRefreshSeconds int      `json:"rules_refresh_seconds"`
	GateMaxStaleSeconds int      `json:"gate_max_stale_seconds"`
	ProcessDenylist     []string `json:"process_denylist"`
	ForegroundDenylist  []string `json:"foreground_denylist"`
}

func DefaultPolicy() Policy {
	return Policy{
		HeartbeatSeconds:    15,
		PortProbeSeconds:    60,
		KeepaliveSeconds:    300,
		RulesRefreshSeconds: 300,
		GateMaxStaleSeconds: GateMaxStaleSeconds,
		ProcessDenylist: []string{
			"ollama", "lmstudio", "lm studio", "jan", "gpt4all", "llama-server",
			"llama.cpp", "vllm", "koboldcpp", "localai", "text-generation-webui",
			"tabby", "continue", "gpt4all-chat",
		},
		ForegroundDenylist: []string{
			"ai.ollama", "com.ollama", "lmstudio", "ai.jan", "com.gpt4all", "koboldcpp",
		},
	}
}

type PortMatch struct {
	Port      int    `json:"port"`
	RuleID    string `json:"rule_id"`
	Product   string `json:"product"`
	Confirmed bool   `json:"confirmed"`
}

// Signals is the full observable set. The agent sends the current matched sets
// rather than diffs — they are 0–3 entries in practice, and SignalHash already
// removes the cost of repeats.
type Signals struct {
	ForegroundDwell   map[string]int64 `json:"foreground_dwell"`
	ForegroundApp     string           `json:"foreground_app"`
	Ports             []PortMatch      `json:"ports"`
	InternetReachable bool             `json:"internet_reachable"`
	ProcessMatches    []string         `json:"process_matches"`
	TotalProcesses    int              `json:"total_processes"`
	LanIP             string           `json:"lan_ip"`
}

type Heartbeat struct {
	BootID       string    `json:"boot_id" binding:"required"`
	Seq          int64     `json:"seq"`
	MonoMs       int64     `json:"mono_ms"`
	WallTS       time.Time `json:"wall_ts"`
	AgentVersion string    `json:"agent_version"`
	LoopbackPort int       `json:"loopback_port"`
	AttestNonce  string    `json:"attest_nonce"`
	SignalHash   string    `json:"signal_hash"`
	Buffered     bool      `json:"buffered"`
	ShellAlive   bool      `json:"shell_alive"`
	Signals      Signals   `json:"signals"`
}

type EventsRequest struct {
	Heartbeats []Heartbeat `json:"heartbeats" binding:"required"`
}

type ShutdownRequest struct {
	Reason string `json:"reason"`
	BootID string `json:"boot_id"`
}

type EnrollRequest struct {
	Username       string `json:"username" binding:"required"`
	Password       string `json:"password" binding:"required"`
	MachineID      string `json:"machine_id" binding:"required"`
	Platform       string `json:"platform"`
	AgentVersion   string `json:"agent_version"`
	ConsentVersion string `json:"consent_version"`
}

type EnrollResponse struct {
	AgentID     string `json:"agent_id"`
	AgentToken  string `json:"agent_token"`
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Policy      Policy `json:"policy"`
}

// Integrity is what the server concluded about this heartbeat's provenance,
// independent of what it observed on the endpoint.
type Integrity struct {
	NewBoot     bool
	CleanRestart bool
	SeqReplay   bool
	ClockSkewMs int64
	Rebound     bool
}

// NewToken returns the agent's long-lived credential. Its only power is sending
// telemetry as its own enrollment, which is why it lives in a 0600 file on the
// endpoint rather than behind an OS keychain prompt on 300 laptops.
func NewToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// NewNonce returns the rotating loopback attestation value. A portal that can
// read it over 127.0.0.1 is on the same machine as this agent.
func NewNonce() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// HashToken maps a raw token to its at-rest identifier, matching the session
// repository: the token already carries 256 bits of entropy, so a fast hash is
// sufficient and a database leak yields nothing replayable.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
