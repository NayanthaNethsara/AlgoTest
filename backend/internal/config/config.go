package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port           string
	Env            string
	AllowedOrigins []string
	DatabaseURL    string
	JudgeWorkers   int
	QueueSize      int
}

func Load() Config {
	return Config{
		Port:           getenv("PORT", "8080"),
		Env:            getenv("ENV", "development"),
		AllowedOrigins: strings.Split(getenv("ALLOWED_ORIGINS", "http://localhost:3000"), ","),
		DatabaseURL:    getenv("DATABASE_URL", "postgres://algothon:algothon@localhost:5432/algothon?sslmode=disable"),
		JudgeWorkers:   getenvInt("JUDGE_WORKERS", 2),
		QueueSize:      getenvInt("JUDGE_QUEUE_SIZE", 64),
	}
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
