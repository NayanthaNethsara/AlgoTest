package team

import (
	"time"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

const MaxTeamMembers = 3

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
