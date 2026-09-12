package crypto

import (
	"testing"
)

func TestSHA256Hex(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},
		{"hello world", "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"},
	}

	for _, tt := range tests {
		got := SHA256Hex([]byte(tt.input))
		if got != tt.expected {
			t.Errorf("SHA256Hex(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestHashToken(t *testing.T) {
	got := HashToken("test-token")
	expected := SHA256Hex([]byte("test-token"))
	if got != expected {
		t.Errorf("HashToken mismatch: got %s, want %s", got, expected)
	}
}

func TestHMACComputationAndVerification(t *testing.T) {
	key := []byte("secret-key-12345")
	data := []byte("important payload data")

	sig := ComputeHMAC(key, data)
	if sig == "" {
		t.Fatal("expected non-empty HMAC signature")
	}

	if !VerifyHMAC(key, data, sig) {
		t.Fatal("expected valid signature to verify")
	}

	if VerifyHMAC(key, []byte("tampered payload"), sig) {
		t.Fatal("expected tampered payload to fail verification")
	}

	if VerifyHMAC([]byte("wrong-key"), data, sig) {
		t.Fatal("expected wrong key to fail verification")
	}

	if VerifyHMAC(key, data, "invalid-hex") {
		t.Fatal("expected invalid hex to fail verification")
	}
}

func TestRFC4231TestCase2(t *testing.T) {
	key := []byte("Jefe")
	data := []byte("what do ya want for nothing?")
	sig := ComputeHMAC(key, data)
	expected := "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
	if sig != expected {
		t.Fatalf("got %s, want %s", sig, expected)
	}
}

func TestRandomGenerators(t *testing.T) {
	bytes, err := RandomBytes(16)
	if err != nil {
		t.Fatalf("RandomBytes failed: %v", err)
	}
	if len(bytes) != 16 {
		t.Fatalf("expected 16 bytes, got %d", len(bytes))
	}

	hexStr, err := RandomHex(16)
	if err != nil {
		t.Fatalf("RandomHex failed: %v", err)
	}
	if len(hexStr) != 32 {
		t.Fatalf("expected 32 hex chars, got %d", len(hexStr))
	}

	urlSafe, err := RandomURLSafe(32)
	if err != nil {
		t.Fatalf("RandomURLSafe failed: %v", err)
	}
	if len(urlSafe) == 0 {
		t.Fatal("expected non-empty URL-safe random string")
	}
}
