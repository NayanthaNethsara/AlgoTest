package agent

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/crypto"
)

var (
	ErrUnknownAgent = errors.New("agent token not recognised")
	ErrRevoked      = errors.New("agent enrollment revoked")
)

const (
	GateMaxStaleSeconds  = 90
	ClockSkewToleranceMs = 120_000
)

type AccessMode string

const (
	ModeDesktopShell AccessMode = "DESKTOP"
	ModeWebWithAgent AccessMode = "WEB_WITH_AGENT"
	ModeWebOnly      AccessMode = "WEB_ONLY"
)

var AllAccessModes = []AccessMode{ModeDesktopShell, ModeWebWithAgent, ModeWebOnly}

type AccessGrant struct {
	WebOnly bool `json:"web_only"`
}

func (g AccessGrant) Allows(m AccessMode) bool {
	switch m {
	case ModeDesktopShell, ModeWebWithAgent:
		return true
	case ModeWebOnly:
		return g.WebOnly
	default:
		return false
	}
}

func (g AccessGrant) Modes() []AccessMode {
	modes := make([]AccessMode, 0, len(AllAccessModes))
	for _, m := range AllAccessModes {
		if g.Allows(m) {
			modes = append(modes, m)
		}
	}
	return modes
}

func (g AccessGrant) IsDefault() bool {
	return !g.WebOnly
}

func UnionAccessGrant(a, b AccessGrant) AccessGrant {
	return AccessGrant{
		WebOnly: a.WebOnly || b.WebOnly,
	}
}

func ParseAccessMode(raw string) (AccessMode, bool) {
	for _, m := range AllAccessModes {
		if AccessMode(raw) == m {
			return m, true
		}
	}
	return "", false
}

type Agent struct {
	ID            string     `json:"id"`
	UserID        string     `json:"userId"`
	MachineID     string     `json:"machineId"`
	AgentVersion  string     `json:"agentVersion"`
	Platform      string     `json:"platform"`
	BinaryHash    string     `json:"binaryHash,omitempty"`
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

type Policy struct {
	HeartbeatSeconds    int      `json:"heartbeat_seconds"`
	PortProbeSeconds    int      `json:"port_probe_seconds"`
	KeepaliveSeconds    int      `json:"keepalive_seconds"`
	RulesRefreshSeconds int      `json:"rules_refresh_seconds"`
	GateMaxStaleSeconds int      `json:"gate_max_stale_seconds"`
	ProcessDenylist     []string `json:"process_denylist"`
	ForegroundDenylist  []string `json:"foreground_denylist"`
	ForegroundAllowlist []string `json:"foreground_allowlist"`
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
			"tabby serve", "gpt4all-chat", "copilot-agent", "copilot-language-server",
			"github.copilot", "codeium-lsp", "tabnine", "tabnine-deep-local",
			"continue.continue", "supermaven", "cursor", "windsurf", "trae",
			"pearai", "void-editor", "claude", "aider", "copilot", "sgpt",
			"interpreter", "open-interpreter", "cody", "goose", "llm", "gemini-cli",
			"amp", "qodo", "antigravity", "antigravity-ide",
			"cline", "roo-cline", "roocode", "open-webui", "chatbox", "cherry-studio",
		},
		ForegroundDenylist: []string{
			"ai.ollama", "com.ollama", "lmstudio", "ai.jan", "com.gpt4all", "koboldcpp",
			"com.todesktop.230313mzl4w4u92", "com.exafunction.windsurf", "cursor",
			"windsurf", "trae", "pearai", "com.google.antigravity-ide", "antigravity",
			"chatbox", "cherry-studio",
		},
		ForegroundAllowlist: []string{
			"com.google.chrome", "chrome", "google-chrome", "org.mozilla.firefox", "firefox",
			"com.apple.safari", "safari", "com.microsoft.edgemac", "msedge", "edge",
			"com.brave.browser", "brave", "com.microsoft.vscode", "code",
			"com.microsoft.vscodeinsiders", "vscodium", "codium", "com.jetbrains.intellij",
			"idea", "com.jetbrains.pycharm", "pycharm", "com.jetbrains.clion", "clion",
			"com.jetbrains.webstorm", "webstorm", "com.jetbrains.goland", "goland",
			"com.jetbrains.rider", "rider", "com.apple.dt.xcode", "xcode", "devenv",
			"visual studio", "com.sublimetext.4", "com.sublimetext.3", "sublime_text",
			"sublime", "nvim", "neovim", "vim", "emacs", "eclipse", "codeblocks",
			"geany", "notepad++", "kate", "com.apple.terminal", "terminal",
			"com.googlecode.iterm2", "iterm", "iterm2", "windowsterminal", "cmd",
			"powershell", "pwsh", "alacritty", "kitty", "wezterm", "warp",
			"mini-algothon-competitor", "com.minialgothon.competitor", "app",
			"com.apple.finder", "finder", "explorer", "systemsettings",
			"com.apple.systempreferences",
		},
	}
}

type PortMatch struct {
	Port      int    `json:"port"`
	RuleID    string `json:"rule_id"`
	Product   string `json:"product"`
	Confirmed bool   `json:"confirmed"`
}

type Signals struct {
	ForegroundDwell   map[string]int64 `json:"foreground_dwell"`
	ForegroundApp     string           `json:"foreground_app"`
	Ports             []PortMatch      `json:"ports"`
	InternetReachable bool             `json:"internet_reachable"`
	ProcessMatches    []string         `json:"process_matches"`
	ExtensionMatches  []string         `json:"extension_matches,omitempty"`
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
	BinaryHash     string `json:"binary_hash,omitempty"`
}

type EnrollResponse struct {
	AgentID     string `json:"agent_id"`
	AgentToken  string `json:"agent_token"`
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Policy      Policy `json:"policy"`
}

type Integrity struct {
	NewBoot      bool
	CleanRestart bool
	SeqReplay    bool
	ClockSkewMs  int64
	Rebound      bool
}

type Fleet struct {
	Competitors   int `json:"competitors"`
	Enrolled      int `json:"enrolled"`
	Online        int `json:"online"`
	Stale         int `json:"stale"`
	Offline       int `json:"offline"`
	NeverReported int `json:"neverReported"`
	InGap         int `json:"inGap"`
	Stopped       int `json:"stopped"`
	BrowserActive int `json:"browserActive"`
	Exempt        int `json:"exempt"`
	HighRisk      int `json:"highRisk"`
	MediumRisk    int `json:"mediumRisk"`
}

type Incident struct {
	ID              string     `json:"id"`
	StartedAt       time.Time  `json:"startedAt"`
	EndedAt         *time.Time `json:"endedAt,omitempty"`
	AffectedAgents  int        `json:"affectedAgents"`
	EnrolledAgents  int        `json:"enrolledAgents"`
	Note            string     `json:"note"`
	DurationSeconds int        `json:"durationSeconds"`
}

type Overview struct {
	Fleet    Fleet     `json:"fleet"`
	Incident *Incident `json:"incident"`
}

const (
	KindEvent      = "event"
	KindGap        = "gap"
	KindFinding    = "finding"
	KindSubmission = "submission"
	KindEnrollment = "enrollment"
)

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

type CompetitorRiskItem struct {
	UserID        string     `json:"user_id"`
	Username      string     `json:"username"`
	DisplayName   string     `json:"display_name"`
	ProctorExempt bool       `json:"proctor_exempt"`
	Score         int        `json:"score"`
	Severity      string     `json:"severity"`
	FindingCount  int        `json:"finding_count"`
	LastPingAt    *time.Time `json:"last_ping_at"`
	AllowWebOnly  bool       `json:"allow_web_only"`
}

type FindingItem struct {
	ID           string         `json:"id"`
	RuleID       string         `json:"rule_id"`
	Title        string         `json:"title"`
	Category     string         `json:"category"`
	Weight       int            `json:"weight"`
	Occurrences  int            `json:"occurrences"`
	Evidence     any            `json:"evidence"`
	SubmissionID *string        `json:"submission_id"`
	FirstSeenAt  time.Time      `json:"first_seen_at"`
	LastSeenAt   time.Time      `json:"last_seen_at"`
}

type AgentItem struct {
	ID            string     `json:"id"`
	UserID        string     `json:"user_id"`
	Username      string     `json:"username"`
	DisplayName   string     `json:"display_name"`
	MachineID     string     `json:"machine_id"`
	Platform      string     `json:"platform"`
	AgentVersion  string     `json:"agent_version"`
	LoopbackPort  int        `json:"loopback_port"`
	EnrolledAt    time.Time  `json:"enrolled_at"`
	LastSeenAt    *time.Time `json:"last_seen_at"`
	StoppedAt     *time.Time `json:"stopped_at"`
	StoppedReason string     `json:"stopped_reason"`
	RevokedAt     *time.Time `json:"revoked_at"`
	RevokedReason string     `json:"revoked_reason"`
	InGap         bool       `json:"in_gap"`
	BinaryHash    string     `json:"binary_hash"`
}

func NewToken() (string, error) {
	return crypto.RandomURLSafe(32)
}

func NewNonce() (string, error) {
	return crypto.RandomHex(16)
}

func HashToken(token string) string {
	return crypto.HashToken(token)
}

func CompareSemver(a, b string) int {
	pa := parseSemverComponents(a)
	pb := parseSemverComponents(b)

	for i := 0; i < 3; i++ {
		if pa[i] < pb[i] {
			return -1
		}
		if pa[i] > pb[i] {
			return 1
		}
	}
	return 0
}

func parseSemverComponents(v string) [3]int {
	var result [3]int
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "v")
	v = strings.TrimPrefix(v, "V")

	if idx := strings.Index(v, "-"); idx >= 0 {
		v = v[:idx]
	}

	parts := strings.Split(v, ".")
	for i := 0; i < len(parts) && i < 3; i++ {
		if num, err := strconv.Atoi(strings.TrimSpace(parts[i])); err == nil && num >= 0 {
			result[i] = num
		}
	}
	return result
}

func ComputeHMAC(key, data []byte) string {
	return crypto.ComputeHMAC(key, data)
}

func VerifyHMAC(key, data []byte, sigHex string) bool {
	return crypto.VerifyHMAC(key, data, sigHex)
}
