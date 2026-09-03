package agent

import (
	"testing"
)

func TestHMACComputationAndVerification(t *testing.T) {
	key := []byte("secret-agent-token-key-1234567890")
	payload := []byte(`{"boot_id":"123","seq":1,"processes":["code.exe"]}`)

	sig := ComputeHMAC(key, payload)
	if sig == "" {
		t.Fatal("expected non-empty HMAC signature")
	}

	if !VerifyHMAC(key, payload, sig) {
		t.Fatal("expected valid signature to verify")
	}

	tamperedPayload := []byte(`{"boot_id":"123","seq":1,"processes":[]}`)
	if VerifyHMAC(key, tamperedPayload, sig) {
		t.Fatal("expected tampered payload verification to fail")
	}

	wrongKey := []byte("wrong-token-key")
	if VerifyHMAC(wrongKey, payload, sig) {
		t.Fatal("expected wrong key verification to fail")
	}

	if VerifyHMAC(key, payload, "invalid-hex-signature") {
		t.Fatal("expected invalid hex signature to fail")
	}
}

func TestRFC4231TestCase2(t *testing.T) {
	key := []byte("Jefe")
	data := []byte("what do ya want for nothing?")
	sig := ComputeHMAC(key, data)
	t.Logf("Computed HMAC: %s", sig)
	expected := "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
	if sig != expected {
		t.Fatalf("got %s, want %s", sig, expected)
	}
}
