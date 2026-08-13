package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port           string
	Env            string
	AllowedOrigins []string
	// TrustedProxies are the only peers whose forwarded-client-IP headers are
	// believed. Empty means trust none, which makes ClientIP the direct peer.
	// Gin's own default is to trust *every* proxy, so leaving this unset would let
	// anyone who can reach the API dictate the IP recorded against a submission.
	TrustedProxies []string
	DatabaseURL    string
	// DBMaxConns bounds the shared pool. pgxpool defaults to max(4, NumCPU), which
	// on a small container is four connections for the judge, submissions, admin
	// queries and telemetry ingest combined — and telemetry arrives from the whole
	// fleet at once whenever a shared condition changes. Too low and telemetry
	// starves submissions; too high and Postgres runs out of backends.
	DBMaxConns int32
	// DBMinConns keeps connections warm so a fleet-wide burst is not also a
	// connection-establishment storm.
	DBMinConns   int32
	JudgeWorkers int
	QueueSize    int

	SessionCookieName string
	SessionTTLHours   int

	EnableTelemetry bool

	RunCompileTimeoutSeconds int
	RunWallTimeoutSeconds    int
	RunCPUSeconds            int
	RunMemory                string
	RunIsolateBin            string
	RunWorkRoot              string
	// RunMaxConcurrent must not exceed the isolate host's provisioned
	// num_boxes; the server checks this at startup and refuses to boot if the
	// host can't supply that many sandboxes.
	RunMaxConcurrent  int
	RunReserve        int
	RunMaxQueue       int
	RunMaxWaitSeconds int
}

func Load() Config {
	c := Config{
		Port:           getenv("PORT", "8080"),
		Env:            getenv("ENV", "development"),
		AllowedOrigins: strings.Split(getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001,tauri://localhost,http://tauri.localhost,https://tauri.localhost"), ","),
		TrustedProxies: splitNonEmpty(getenv("TRUSTED_PROXIES", "")),
		DatabaseURL:    getenv("DATABASE_URL", "postgres://algothon:algothon@localhost:5432/algothon?sslmode=disable"),
		DBMaxConns:     int32(getenvInt("DB_MAX_CONNS", 25)),
		DBMinConns:     int32(getenvInt("DB_MIN_CONNS", 5)),
		JudgeWorkers:   getenvInt("JUDGE_WORKERS", 0),
		QueueSize:      getenvInt("JUDGE_QUEUE_SIZE", 64),

		SessionCookieName: getenv("SESSION_COOKIE_NAME", "session"),
		SessionTTLHours:   getenvInt("SESSION_TTL_HOURS", 24*7),

		EnableTelemetry: getenvBool("ENABLE_TELEMETRY", true),

		RunCompileTimeoutSeconds: getenvInt("RUN_COMPILE_TIMEOUT_SECONDS", 10),
		RunWallTimeoutSeconds:    getenvInt("RUN_WALL_TIMEOUT_SECONDS", 10),
		RunCPUSeconds:            getenvInt("RUN_CPU_SECONDS", 5),
		RunMemory:                getenv("RUN_MEMORY", "256m"),
		RunIsolateBin:            getenv("RUN_ISOLATE_BIN", "isolate"),
		RunWorkRoot:              getenv("RUN_WORK_ROOT", ""),
		RunMaxConcurrent:         getenvInt("RUN_MAX_CONCURRENT", 4),
		RunReserve:               getenvInt("RUN_RESERVE", 1),
		RunMaxQueue:              getenvInt("RUN_MAX_QUEUE", 64),
		RunMaxWaitSeconds:        getenvInt("RUN_MAX_WAIT_SECONDS", 15),
	}

	if c.JudgeWorkers <= 0 {
		c.JudgeWorkers = c.RunMaxConcurrent - c.RunReserve
	}
	if c.JudgeWorkers < 1 {
		c.JudgeWorkers = 1
	}

	return c
}

// SessionTTL is how long a login session stays valid.
func (c Config) SessionTTL() time.Duration {
	return time.Duration(c.SessionTTLHours) * time.Hour
}

// RunCompileTimeout bounds how long the sandboxed compile step may run.
func (c Config) RunCompileTimeout() time.Duration {
	return time.Duration(c.RunCompileTimeoutSeconds) * time.Second
}

// RunWallTimeout is the wall-clock backstop that force-kills a run regardless
// of CPU usage (catches sleep/blocking loops). Keep it above RunCPUSeconds.
func (c Config) RunWallTimeout() time.Duration {
	return time.Duration(c.RunWallTimeoutSeconds) * time.Second
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// splitNonEmpty parses a comma-separated env var, dropping blanks so that an
// unset or trailing-comma value yields an empty list rather than a "" entry.
func splitNonEmpty(v string) []string {
	out := []string{}
	for _, part := range strings.Split(v, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func getenvInt(key string, fallback int) int {
	v, err := strconv.Atoi(os.Getenv(key))
	if err != nil {
		return fallback
	}
	return v
}

func getenvBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v == "true" || v == "1"
}
