package team

import (
	"testing"
)

func TestMaxTeamMembersConstant(t *testing.T) {
	if MaxTeamMembers != 3 {
		t.Fatalf("expected MaxTeamMembers to be 3, got %d", MaxTeamMembers)
	}
}
