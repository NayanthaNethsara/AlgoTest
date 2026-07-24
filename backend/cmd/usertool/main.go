// usertool creates competitor/organizer accounts for offline events.
//
//	go run ./cmd/usertool -username alice -name "Alice" -role admin
//	go run ./cmd/usertool -file competitors.csv
//
// CSV columns: username,display_name,password  (password optional -> generated).
// Generated passwords are printed once so organizers can hand them out.
package main

import (
	"context"
	"encoding/csv"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/auth"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/db"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

func main() {
	_ = godotenv.Load()

	file := flag.String("file", "", "CSV file of users (username,display_name,password)")
	username := flag.String("username", "", "single user's username")
	name := flag.String("name", "", "single user's display name")
	password := flag.String("password", "", "single user's password (generated if empty)")
	role := flag.String("role", "competitor", "role: competitor | admin")
	flag.Parse()

	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	if err := db.Migrate(cfg.DatabaseURL); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	repo := user.NewRepository(pool)

	var rows []userRow
	switch {
	case *file != "":
		rows, err = readCSV(*file)
		if err != nil {
			log.Fatalf("read csv: %v", err)
		}
	case *username != "":
		rows = []userRow{{username: *username, name: displayOr(*name, *username), password: *password, role: *role}}
	default:
		flag.Usage()
		os.Exit(2)
	}

	fmt.Printf("%-20s %-24s %-12s %s\n", "USERNAME", "DISPLAY NAME", "ROLE", "PASSWORD")
	for _, row := range rows {
		pw := row.password
		if pw == "" {
			pw = auth.GeneratePassword(10)
		}
		hash, err := auth.HashPassword(pw)
		if err != nil {
			log.Printf("skip %s: hash: %v", row.username, err)
			continue
		}
		if _, err := repo.Create(ctx, row.username, row.name, hash, roleOr(row.role)); err != nil {
			log.Printf("skip %s: %v", row.username, err)
			continue
		}
		fmt.Printf("%-20s %-24s %-12s %s\n", row.username, row.name, roleOr(row.role), pw)
	}
}

type userRow struct {
	username string
	name     string
	password string
	role     string
}

func readCSV(path string) ([]userRow, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1
	r.TrimLeadingSpace = true

	var rows []userRow
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, err
		}
		if len(rec) == 0 || strings.TrimSpace(rec[0]) == "" {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(rec[0]), "username") {
			continue // header
		}
		row := userRow{username: strings.TrimSpace(rec[0])}
		if len(rec) > 1 {
			row.name = strings.TrimSpace(rec[1])
		}
		if len(rec) > 2 {
			row.password = strings.TrimSpace(rec[2])
		}
		if row.name == "" {
			row.name = row.username
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func displayOr(name, fallback string) string {
	if name != "" {
		return name
	}
	return fallback
}

func roleOr(role string) string {
	if role == "" {
		return "competitor"
	}
	return role
}
