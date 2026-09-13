package team

import (
	"errors"
	"strings"
	"time"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

const (
	MaxTeamMembers    = 3
	MaxTeamNameLength = 100
)

var (
	ErrTeamNameEmpty   = errors.New("team name cannot be empty")
	ErrTeamNameTooLong = errors.New("team name cannot exceed 100 characters")
)

// ValidateTeamName checks that team name is not empty and within bounds.
func ValidateTeamName(name string) error {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return ErrTeamNameEmpty
	}
	if len(trimmed) > MaxTeamNameLength {
		return ErrTeamNameTooLong
	}
	return nil
}

type Team struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	CreatedAt time.Time   `json:"createdAt"`
	Members   []user.User `json:"members,omitempty"`
}

type LeaderboardEntry struct {
	Rank             int        `json:"rank"`
	TeamID           string     `json:"teamId"`
	TeamName         string     `json:"teamName"`
	TotalScore       int        `json:"totalScore"`
	ProblemsSolved   int        `json:"problemsSolved"`
	LastSubmissionAt *time.Time `json:"lastSubmissionAt,omitempty"`
}
