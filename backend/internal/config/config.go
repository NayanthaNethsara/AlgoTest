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
	}
}

// SessionTTL is how long a login session stays valid.
func (c Config) SessionTTL() time.Duration {
	return time.Duration(c.SessionTTLHours) * time.Hour
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
