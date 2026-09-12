package audit

import (
	"testing"
)

func TestAuditConstants(t *testing.T) {
	if ActionAuthLoginSuccess != "auth.login.success" {
		t.Fatalf("unexpected login success constant: %s", ActionAuthLoginSuccess)
	}
	if ActionAuthLoginFailure != "auth.login.failure" {
		t.Fatalf("unexpected login failure constant: %s", ActionAuthLoginFailure)
	}
	if ActionAuthLoginLocked != "auth.login.locked" {
		t.Fatalf("unexpected login locked constant: %s", ActionAuthLoginLocked)
	}
	if ActionUserDelete != "user.delete" {
		t.Fatalf("unexpected user delete constant: %s", ActionUserDelete)
	}
	if ActionContestStart != "contest.start" {
		t.Fatalf("unexpected contest start constant: %s", ActionContestStart)
	}
	if ActionContestEnd != "contest.end" {
		t.Fatalf("unexpected contest end constant: %s", ActionContestEnd)
	}
	if ActionProblemCreate != "problem.create" {
		t.Fatalf("unexpected problem create constant: %s", ActionProblemCreate)
	}
	if ActionSubmissionReview != "submission.review" {
		t.Fatalf("unexpected submission review constant: %s", ActionSubmissionReview)
	}
}

func TestFilterOptionsDefaults(t *testing.T) {
	opts := FilterOptions{
		Limit:  0,
		Offset: -5,
	}
	if opts.Limit != 0 {
		t.Fatalf("expected initial limit 0, got %d", opts.Limit)
	}
}
