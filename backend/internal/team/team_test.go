package team

import (
	"testing"
	"time"
)

func TestMaxTeamMembersConstant(t *testing.T) {
	if MaxTeamMembers != 3 {
		t.Fatalf("expected MaxTeamMembers to be 3, got %d", MaxTeamMembers)
	}
}

func TestValidateTeamName(t *testing.T) {
	if err := ValidateTeamName(""); err == nil {
		t.Fatal("expected error on empty team name")
	}
	if err := ValidateTeamName("   "); err == nil {
		t.Fatal("expected error on whitespace team name")
	}
	if err := ValidateTeamName("Valid Team"); err != nil {
		t.Fatalf("unexpected error on valid team name: %v", err)
	}
}

func TestAssignLeaderboardRanks(t *testing.T) {
	now := time.Now()
	t1 := now.Add(-10 * time.Minute)
	t2 := now.Add(-5 * time.Minute)

	raw := []LeaderboardEntry{
		{TeamID: "1", TeamName: "Team Alpha", TotalScore: 200, LastSubmissionAt: &t1},
		{TeamID: "2", TeamName: "Team Beta", TotalScore: 100, LastSubmissionAt: &t2},
		{TeamID: "3", TeamName: "Team Gamma", TotalScore: 100, LastSubmissionAt: &t2},
		{TeamID: "4", TeamName: "Team Delta", TotalScore: 50, LastSubmissionAt: &t1},
	}

	ranked := assignLeaderboardRanks(raw)
	expectedRanks := []int{1, 2, 2, 4}

	for i, r := range ranked {
		if r.Rank != expectedRanks[i] {
			t.Errorf("entry %d (%s) got rank %d, want %d", i, r.TeamName, r.Rank, expectedRanks[i])
		}
	}
}
