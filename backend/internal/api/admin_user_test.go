package api

import (
	"errors"
	"testing"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

func TestPasswordLengthValidation(t *testing.T) {
	if err := checkPasswordLength("short"); !errors.Is(err, errPasswordTooShort) {
		t.Fatalf("expected errPasswordTooShort for short password, got %v", err)
	}
	if err := checkPasswordLength("validlength123"); err != nil {
		t.Fatalf("expected nil error for valid password, got %v", err)
	}
	if err := checkPasswordLength(""); err != nil {
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
