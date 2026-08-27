package session

import "testing"

func TestHashToken(t *testing.T) {
	token := "test-session-token-12345"
	hashed := hashToken(token)

	if hashed == "" {
		t.Fatal("expected non-empty hash")
	}

	if hashed == token {
		t.Fatal("expected token to be hashed, but got plain text")
	}

	if hashToken(token) != hashed {
		t.Fatal("expected hashToken to be deterministic")
	}
}
