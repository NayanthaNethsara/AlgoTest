// migrate applies all pending goose migrations and exits. The server and
// usertool also run this automatically on startup; this command exists so
// migrations can be applied explicitly (e.g. in CI or before a manual restore).
package main

import (
	"log"

	"github.com/joho/godotenv"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/db"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()

	if err := db.Migrate(cfg.DatabaseURL); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	log.Println("migrations applied")
}
