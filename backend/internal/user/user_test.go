package user

import (
	"encoding/json"
	"errors"
	"strings"
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

func TestValidateUsername(t *testing.T) {
	valid := []string{"alice", "bob_123", "team-lead-01", "USER_NAME", "abc", strings.Repeat("a", 50)}
	for _, u := range valid {
		if err := ValidateUsername(u); err != nil {
			t.Errorf("ValidateUsername(%q) unexpected error: %v", u, err)
		}
	}

	invalid := []struct {
		username string
		wantErr  error
	}{
		{"", ErrUsernameRequired},
		{"   ", ErrUsernameRequired},
		{"ab", ErrUsernameLength},
		{"a", ErrUsernameLength},
		{strings.Repeat("a", 51), ErrUsernameLength},
		{"user name", ErrUsernameInvalid},
		{"user@name", ErrUsernameInvalid},
		{"user!name", ErrUsernameInvalid},
	}
	for _, tc := range invalid {
		err := ValidateUsername(tc.username)
		if !errors.Is(err, tc.wantErr) {
			t.Errorf("ValidateUsername(%q) = %v, want %v", tc.username, err, tc.wantErr)
		}
	}
}

func TestCheckPasswordLength(t *testing.T) {
	if err := CheckPasswordLength("short"); !errors.Is(err, ErrPasswordTooShort) {
		t.Fatalf("expected ErrPasswordTooShort, got %v", err)
	}
	if err := CheckPasswordLength("validlength123"); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
	if err := CheckPasswordLength(""); err != nil {
		t.Fatalf("expected nil for empty, got %v", err)
	}
}
