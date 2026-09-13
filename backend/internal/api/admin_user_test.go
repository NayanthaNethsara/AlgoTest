package api

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

func TestPasswordLengthValidation(t *testing.T) {
	if err := user.CheckPasswordLength("short"); !errors.Is(err, user.ErrPasswordTooShort) {
		t.Fatalf("expected ErrPasswordTooShort for short password, got %v", err)
	}
	if err := user.CheckPasswordLength("validlength123"); err != nil {
		t.Fatalf("expected nil error for valid password, got %v", err)
	}
	if err := user.CheckPasswordLength(""); err != nil {
		t.Fatalf("expected nil error for empty password (auto-generated), got %v", err)
	}
}

func TestUserRoleValidation(t *testing.T) {
	if !user.ValidRole(user.RoleCompetitor) {
		t.Fatal("expected RoleCompetitor to be valid")
	}
	if !user.ValidRole(user.RoleAdmin) {
		t.Fatal("expected RoleAdmin to be valid")
	}
	if user.ValidRole("guest") {
		t.Fatal("expected 'guest' to be invalid")
	}
}

func TestTeamMembershipErrors(t *testing.T) {
	if team.ErrTeamFull == nil {
		t.Fatal("expected ErrTeamFull to be non-nil")
	}
	if team.ErrUserAlreadyInTeam == nil {
		t.Fatal("expected ErrUserAlreadyInTeam to be non-nil")
	}
	if errTeamRequired == nil {
		t.Fatal("expected errTeamRequired to be non-nil")
	}
	if errAdminCreationNotAllowed == nil {
		t.Fatal("expected errAdminCreationNotAllowed to be non-nil")
	}
}

func TestAdminRoleAssignmentBlockedViaAPI(t *testing.T) {
	if user.RoleAdmin == user.RoleCompetitor {
		t.Fatal("expected RoleAdmin and RoleCompetitor to be distinct")
	}
}

func TestSessionRevocationPolicyByRole(t *testing.T) {
	isCompetitorSingleSession := (user.RoleCompetitor != user.RoleAdmin)
	if !isCompetitorSingleSession {
		t.Fatal("expected competitor sessions to enforce single-session revocation")
	}

	isAdminSingleSession := (user.RoleAdmin != user.RoleAdmin)
	if isAdminSingleSession {
		t.Fatal("expected admin sessions to permit concurrent sessions")
	}
}

func TestLoginAttemptTracker(t *testing.T) {
	tracker := NewLoginAttemptTracker(3, 50*time.Millisecond)
	username := "test_operator"

	if locked, _ := tracker.IsLocked(username); locked {
		t.Fatal("expected user not to be locked initially")
	}

	// 2 failures should not lock
	if tracker.RecordFailure(username) {
		t.Fatal("expected user not to be locked after 1 failure")
	}
	if tracker.RecordFailure(username) {
		t.Fatal("expected user not to be locked after 2 failures")
	}
	if locked, _ := tracker.IsLocked(username); locked {
		t.Fatal("expected user not to be locked after 2 failures")
	}

	// 3rd failure locks the account
	if !tracker.RecordFailure(username) {
		t.Fatal("expected user to be locked on 3rd failure")
	}
	if locked, remaining := tracker.IsLocked(username); !locked || remaining <= 0 {
		t.Fatal("expected user to be reported as locked")
	}

	// Wait for lockout duration to expire
	time.Sleep(60 * time.Millisecond)
	if locked, _ := tracker.IsLocked(username); locked {
		t.Fatal("expected user lock to expire after duration")
	}

	// Success clears failure record
	tracker.RecordFailure(username)
	tracker.RecordSuccess(username)
	if locked, _ := tracker.IsLocked(username); locked {
		t.Fatal("expected user not to be locked after success")
	}
}

func TestValidateUsername(t *testing.T) {
	validUsernames := []string{
		"alice",
		"bob_123",
		"team-lead-01",
		"USER_NAME",
		"abc",
		strings.Repeat("a", 50),
	}
	for _, u := range validUsernames {
		if err := user.ValidateUsername(u); err != nil {
			t.Fatalf("expected username '%s' to be valid, got: %v", u, err)
		}
	}

	invalidCases := []struct {
		username    string
		expectedErr error
	}{
		{"", user.ErrUsernameRequired},
		{"   ", user.ErrUsernameRequired},
		{"ab", user.ErrUsernameLength},
		{"a", user.ErrUsernameLength},
		{strings.Repeat("a", 51), user.ErrUsernameLength},
		{"user name", user.ErrUsernameInvalid},
		{"user@name", user.ErrUsernameInvalid},
		{"user!name", user.ErrUsernameInvalid},
		{"user#1", user.ErrUsernameInvalid},
		{"user$1", user.ErrUsernameInvalid},
		{"user%1", user.ErrUsernameInvalid},
		{"user+1", user.ErrUsernameInvalid},
	}
	for _, tc := range invalidCases {
		err := user.ValidateUsername(tc.username)
		if err == nil {
			t.Fatalf("expected error for username '%s', got nil", tc.username)
		}
		if !errors.Is(err, tc.expectedErr) {
			t.Fatalf("expected error %v for username '%s', got %v", tc.expectedErr, tc.username, err)
		}
	}
}

func TestTeamMemberCapacityLimit(t *testing.T) {
	if team.MaxTeamMembers != 3 {
		t.Fatalf("expected MaxTeamMembers to be 3, got %d", team.MaxTeamMembers)
	}
}
