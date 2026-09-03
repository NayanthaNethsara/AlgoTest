package user

import (
	"encoding/json"
	"testing"
	"time"
)

func TestValidRole(t *testing.T) {
	testCases := []struct {
		role    string
		isValid bool
	}{
		{role: RoleCompetitor, isValid: true},
		{role: RoleAdmin, isValid: true},
		{role: "guest", isValid: false},
		{role: "root", isValid: false},
		{role: "", isValid: false},
	}

	for _, tc := range testCases {
		result := ValidRole(tc.role)
		if result != tc.isValid {
			t.Errorf("ValidRole(%q) = %v; want %v", tc.role, result, tc.isValid)
		}
	}
}

func TestUserJSONSerialization(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	teamID := "team-123"
	teamName := "Algorithm Masters"

	contestant := User{
		ID:                  "user-456",
		Username:            "janedoe",
		DisplayName:         "Jane Doe",
		Role:                RoleCompetitor,
		CreatedAt:           now,
		TeamID:              &teamID,
		TeamName:            &teamName,
		ProctorExempt:       false,
		ProctorAllowWebOnly: true,
		IsSuspended:         false,
	}

	marshaled, err := json.Marshal(contestant)
	if err != nil {
		t.Fatalf("failed to marshal user: %v", err)
	}

	var unmarshaled User
	if err := json.Unmarshal(marshaled, &unmarshaled); err != nil {
		t.Fatalf("failed to unmarshal user: %v", err)
	}

	if unmarshaled.ID != contestant.ID || unmarshaled.Username != contestant.Username {
		t.Errorf("user ID or username mismatch after json round-trip")
	}
	if unmarshaled.Role != RoleCompetitor {
		t.Errorf("expected role %q, got %q", RoleCompetitor, unmarshaled.Role)
	}
	if unmarshaled.TeamID == nil || *unmarshaled.TeamID != teamID {
		t.Errorf("team ID mismatch after json round-trip")
	}
}
