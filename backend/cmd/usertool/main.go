// usertool creates the first admin account. Everything else -- competitors,
// teams, bulk imports, further admins -- goes through the admin API, which
// needs an admin to authenticate; this is the only way to get that first one.
//
//	go run ./cmd/usertool -username alice -name "Alice"
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/auth"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/db"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

func main() {
	_ = godotenv.Load()

	username := flag.String("username", "", "admin username")
	name := flag.String("name", "", "admin display name (defaults to username)")
	password := flag.String("password", "", "admin password (generated if empty)")
	flag.Parse()

	if *username == "" {
		flag.Usage()
		os.Exit(2)
	}

	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := db.Connect(ctx, cfg.DatabaseURL, 4, 0)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	if err := db.Migrate(cfg.DatabaseURL); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	displayName := *name
	if displayName == "" {
		displayName = *username
	}

	pw := *password
	if pw == "" {
		pw = auth.GeneratePassword(10)
	}
	hash, err := auth.HashPassword(pw)
	if err != nil {
		log.Fatalf("hash password: %v", err)
	}

	if _, err := user.NewRepository(pool).Create(ctx, *username, displayName, hash, "admin"); err != nil {
		log.Fatalf("create admin %s: %v", *username, err)
	}

	fmt.Printf("%-20s %-24s %s\n", "USERNAME", "DISPLAY NAME", "PASSWORD")
	fmt.Printf("%-20s %-24s %s\n", *username, displayName, pw)
}
