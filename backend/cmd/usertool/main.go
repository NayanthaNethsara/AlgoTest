// usertool creates competitor/organizer accounts for offline events.
//
//	go run ./cmd/usertool -username alice -name "Alice" -role admin
//	go run ./cmd/usertool -file competitors.csv
//
// CSV columns: username,display_name,password,team_name (or team_name,username,display_name,password).
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
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

func main() {
	_ = godotenv.Load()

	file := flag.String("file", "", "CSV file of users (username,display_name,password,team_name)")
	username := flag.String("username", "", "single user's username")
	name := flag.String("name", "", "single user's display name")
	password := flag.String("password", "", "single user's password (generated if empty)")
	teamName := flag.String("team", "", "single user's team name")
	role := flag.String("role", "competitor", "role: competitor | admin")
	flag.Parse()

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

	userRepo := user.NewRepository(pool)
	teamRepo := team.NewRepository(pool)

	var rows []userRow
	switch {
	case *file != "":
		rows, err = readCSV(*file)
		if err != nil {
			log.Fatalf("read csv: %v", err)
		}
	case *username != "":
		rows = []userRow{{username: *username, name: displayOr(*name, *username), password: *password, teamName: *teamName, role: *role}}
	default:
		flag.Usage()
		os.Exit(2)
	}

	fmt.Printf("%-20s %-20s %-24s %-12s %s\n", "TEAM", "USERNAME", "DISPLAY NAME", "ROLE", "PASSWORD")
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
		u, err := userRepo.Create(ctx, row.username, row.name, hash, roleOr(row.role))
		if err != nil {
			log.Printf("skip %s: %v", row.username, err)
			continue
		}

		actualTeamName := "-"
		if row.teamName != "" {
			t, err := teamRepo.GetByName(ctx, row.teamName)
			if err != nil {
				if errors.Is(err, team.ErrTeamNotFound) {
					t, err = teamRepo.CreateTeam(ctx, row.teamName)
					if err != nil {
						log.Printf("user %s created but failed to create team %s: %v", row.username, row.teamName, err)
						continue
					}
				} else {
					log.Printf("user %s created but failed to query team %s: %v", row.username, row.teamName, err)
					continue
				}
			}
			if err := teamRepo.AddMember(ctx, t.ID, u.ID); err != nil {
				log.Printf("user %s created but failed to add to team %s: %v", row.username, row.teamName, err)
				continue
			}
			actualTeamName = t.Name
		}

		fmt.Printf("%-20s %-20s %-24s %-12s %s\n", actualTeamName, row.username, row.name, roleOr(row.role), pw)
	}
}

type userRow struct {
	username string
	name     string
	password string
	teamName string
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
		if strings.EqualFold(strings.TrimSpace(rec[0]), "username") || strings.EqualFold(strings.TrimSpace(rec[0]), "team_name") {
			continue // header
		}

		var row userRow
		if len(rec) >= 4 {
			row = userRow{
				username: strings.TrimSpace(rec[0]),
				name:     strings.TrimSpace(rec[1]),
				password: strings.TrimSpace(rec[2]),
				teamName: strings.TrimSpace(rec[3]),
			}
		} else if len(rec) == 3 {
			row = userRow{
				username: strings.TrimSpace(rec[0]),
				name:     strings.TrimSpace(rec[1]),
				password: strings.TrimSpace(rec[2]),
			}
		} else if len(rec) == 2 {
			row = userRow{
				username: strings.TrimSpace(rec[0]),
				name:     strings.TrimSpace(rec[1]),
			}
		} else {
			row = userRow{
				username: strings.TrimSpace(rec[0]),
				name:     strings.TrimSpace(rec[0]),
			}
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
