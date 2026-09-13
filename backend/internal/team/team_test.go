package team

import (
	"testing"
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
