package auth

import (
	"strings"
	"testing"
)

func TestPasswordHashingAndVerification(t *testing.T) {
	plain := "super-secure-contest-pwd-2026"
	hash, err := HashPassword(plain)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	if !CheckPassword(hash, plain) {
		t.Errorf("CheckPassword returned false for correct password")
	}

	if CheckPassword(hash, "wrong-password") {
		t.Errorf("CheckPassword returned true for wrong password")
	}
}

func TestDummyCompareDoesNotPanic(t *testing.T) {
	DummyCompare("any-password")
}

func TestNewSessionToken(t *testing.T) {
	token1, err := NewSessionToken()
	if err != nil {
		t.Fatalf("NewSessionToken failed: %v", err)
	}

	token2, err := NewSessionToken()
	if err != nil {
		t.Fatalf("NewSessionToken failed: %v", err)
	}

	if token1 == "" || token2 == "" {
		t.Errorf("NewSessionToken generated empty token")
	}

	if token1 == token2 {
		t.Errorf("NewSessionToken generated duplicate tokens: %s", token1)
	}

	if len(token1) < 40 {
		t.Errorf("NewSessionToken length unexpectedly short: %d", len(token1))
	}
}

func TestGeneratePassword(t *testing.T) {
	lengths := []int{8, 12, 16, 24}
	for _, l := range lengths {
		pwd := GeneratePassword(l)
		if len(pwd) != l {
			t.Errorf("GeneratePassword(%d) returned length %d, want %d", l, len(pwd), l)
		}

		// Ensure ambiguous characters are not present
		if strings.ContainsAny(pwd, "0O1lI") {
			t.Errorf("GeneratePassword(%d) contains ambiguous characters: %s", l, pwd)
		}
	}
}
