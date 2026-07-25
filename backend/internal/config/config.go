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
	DatabaseURL    string
	JudgeWorkers   int
	QueueSize      int

	SessionCookieName string
	SessionTTLHours   int

	RunCompileTimeoutSeconds int
	RunWallTimeoutSeconds    int
	RunCPUSeconds            int
	RunMemory                string
	RunDockerRuntime         string
	RunMaxConcurrent         int
	RunMaxQueue              int
	RunMaxWaitSeconds        int
}

func Load() Config {
	return Config{
		Port:           getenv("PORT", "8080"),
		Env:            getenv("ENV", "development"),
		AllowedOrigins: strings.Split(getenv("ALLOWED_ORIGINS", "http://localhost:3000"), ","),
		DatabaseURL:    getenv("DATABASE_URL", "postgres://algothon:algothon@localhost:5432/algothon?sslmode=disable"),
		JudgeWorkers:   getenvInt("JUDGE_WORKERS", 2),
		QueueSize:      getenvInt("JUDGE_QUEUE_SIZE", 64),

		SessionCookieName: getenv("SESSION_COOKIE_NAME", "session"),
		SessionTTLHours:   getenvInt("SESSION_TTL_HOURS", 24*7),

		RunCompileTimeoutSeconds: getenvInt("RUN_COMPILE_TIMEOUT_SECONDS", 10),
		RunWallTimeoutSeconds:    getenvInt("RUN_WALL_TIMEOUT_SECONDS", 10),
		RunCPUSeconds:            getenvInt("RUN_CPU_SECONDS", 5),
		RunMemory:                getenv("RUN_MEMORY", "256m"),
		RunDockerRuntime:         getenv("RUN_DOCKER_RUNTIME", ""),
		RunMaxConcurrent:         getenvInt("RUN_MAX_CONCURRENT", 4),
		RunMaxQueue:              getenvInt("RUN_MAX_QUEUE", 64),
		RunMaxWaitSeconds:        getenvInt("RUN_MAX_WAIT_SECONDS", 15),
	}
}

// SessionTTL is how long a login session stays valid.
func (c Config) SessionTTL() time.Duration {
	return time.Duration(c.SessionTTLHours) * time.Hour
}

// RunCompileTimeout bounds how long a Docker compile step may run.
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

func getenvInt(key string, fallback int) int {
	v, err := strconv.Atoi(os.Getenv(key))
	if err != nil {
		return fallback
	}
	return v
}
