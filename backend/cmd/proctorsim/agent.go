package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type portMatch struct {
	Port      int    `json:"port"`
	RuleID    string `json:"rule_id"`
	Product   string `json:"product"`
	Confirmed bool   `json:"confirmed"`
}

type signals struct {
	ForegroundDwell   map[string]int64 `json:"foreground_dwell"`
	ForegroundApp     string           `json:"foreground_app"`
	Ports             []portMatch      `json:"ports"`
	InternetReachable bool             `json:"internet_reachable"`
	ProcessMatches    []string         `json:"process_matches"`
	TotalProcesses    int              `json:"total_processes"`
	LanIP             string           `json:"lan_ip"`
}

type heartbeat struct {
	BootID       string  `json:"boot_id"`
	Seq          int64   `json:"seq"`
	MonoMs       int64   `json:"mono_ms"`
	WallTS       string  `json:"wall_ts"`
	AgentVersion string  `json:"agent_version"`
	LoopbackPort int     `json:"loopback_port"`
	AttestNonce  string  `json:"attest_nonce"`
	SignalHash   string  `json:"signal_hash"`
	Buffered     bool    `json:"buffered"`
	ShellAlive   bool    `json:"shell_alive"`
	Signals      signals `json:"signals"`
}

// fakeAgent holds exactly the state a real agent holds, so replay and boot-change
// detection are exercised for real rather than mocked.
type fakeAgent struct {
	user      string
	pass      string
	machineID string
	token     string
	agentID   string
	bootID    string
	seq       int64
	startedAt time.Time
	shell     bool
}

func newFakeAgent(user, pass string) *fakeAgent {
	return &fakeAgent{
		user:      user,
		pass:      pass,
		machineID: randomHex(16),
		bootID:    randomUUID(),
		startedAt: time.Now(),
		shell:     true,
	}
}

func (a *fakeAgent) enroll(s *sim) error {
	if a.bootID == "" {
		a.bootID = randomUUID()
		a.startedAt = time.Now()
		a.shell = true
	}

	consentVersion, err := s.consentVersion()
	if err != nil {
		return err
	}

	status, body := s.request(http.MethodPost, "/api/v1/agent/enroll", "", map[string]any{
		"username":        a.user,
		"password":        a.pass,
		"machine_id":      a.machineID,
		"platform":        "proctorsim linux-x86_64",
		"agent_version":   "sim-0.2.0",
		"consent_version": consentVersion,
	})
	if status != http.StatusOK {
		return fmt.Errorf("enroll returned %d: %s", status, strings.TrimSpace(body))
	}

	var parsed struct {
		AgentID    string `json:"agent_id"`
		AgentToken string `json:"agent_token"`
	}
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		return fmt.Errorf("parse enroll response: %w", err)
	}
	a.token, a.agentID = parsed.AgentToken, parsed.AgentID
	s.detail("  enrolled %s on machine %s", a.user, a.machineID[:12])
	return nil
}

// next builds the heartbeat an agent would send now, advancing its sequence.
func (a *fakeAgent) next(mutate func(*signals)) heartbeat {
	a.seq++

	sig := signals{
		ForegroundDwell: map[string]int64{"com.microsoft.VSCode": 12_000},
		ForegroundApp:   "com.microsoft.VSCode",
		TotalProcesses:  412,
		LanIP:           "10.20.4.71",
		ProcessMatches:  []string{},
		Ports:           []portMatch{},
	}
	if mutate != nil {
		mutate(&sig)
	}

	return heartbeat{
		BootID:       a.bootID,
		Seq:          a.seq,
		MonoMs:       time.Since(a.startedAt).Milliseconds(),
		WallTS:       time.Now().UTC().Format(time.RFC3339Nano),
		AgentVersion: "sim-0.2.0",
		LoopbackPort: 47615,
		AttestNonce:  randomHex(16),
		SignalHash:   signalHash(sig),
		ShellAlive:   a.shell,
		Signals:      sig,
	}
}

func (a *fakeAgent) beat(s *sim, mutate func(*signals)) error {
	return a.beatShell(s, a.shell, mutate)
}

func (a *fakeAgent) beatShell(s *sim, shellAlive bool, mutate func(*signals)) error {
	a.shell = shellAlive
	hb := a.next(mutate)

	status, body := a.post(s, "/api/v1/agent/heartbeat", hb)
	if status != http.StatusAccepted {
		return fmt.Errorf("heartbeat returned %d: %s", status, strings.TrimSpace(body))
	}

	s.detail("  seq=%d %s", hb.Seq, describe(hb))
	time.Sleep(s.pace)
	return nil
}

func (a *fakeAgent) flush(s *sim, batch []heartbeat) error {
	status, body := a.post(s, "/api/v1/agent/events", map[string]any{"heartbeats": batch})
	if status != http.StatusAccepted {
		return fmt.Errorf("flush returned %d: %s", status, strings.TrimSpace(body))
	}
	s.detail("  server accepted the replay: %s", strings.TrimSpace(body))
	return nil
}

func (a *fakeAgent) post(s *sim, path string, payload any) (int, string) {
	return s.request(http.MethodPost, path, a.token, payload)
}

func describe(hb heartbeat) string {
	parts := []string{}
	if hb.Signals.InternetReachable {
		parts = append(parts, "internet reachable")
	}
	for _, p := range hb.Signals.Ports {
		if p.Confirmed {
			parts = append(parts, fmt.Sprintf("%s on %d", p.Product, p.Port))
		}
	}
	if len(hb.Signals.ProcessMatches) > 0 {
		parts = append(parts, "processes "+strings.Join(hb.Signals.ProcessMatches, ","))
	}
	if !hb.ShellAlive {
		parts = append(parts, "browser (no desktop shell)")
	}
	if len(parts) == 0 {
		parts = append(parts, "clean")
	}
	return strings.Join(parts, " · ")
}

// signalHash mirrors the client: only stateful signals, so unchanged heartbeats
// short-circuit on the server exactly as they would in production.
func signalHash(sig signals) string {
	h := sha256.New()
	if sig.InternetReachable {
		h.Write([]byte("net:1"))
	} else {
		h.Write([]byte("net:0"))
	}
	for _, p := range sig.Ports {
		if p.Confirmed {
			fmt.Fprintf(h, "|port:%s:%d", p.RuleID, p.Port)
		}
	}
	for _, m := range sig.ProcessMatches {
		fmt.Fprintf(h, "|proc:%s", m)
	}
	for _, app := range sortedKeys(sig.ForegroundDwell) {
		fmt.Fprintf(h, "|fg:%s", app)
	}
	return hex.EncodeToString(h.Sum(nil))
}

func readBody(resp *http.Response) string {
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return string(body)
}
