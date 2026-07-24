package auth

import (
	"crypto/rand"
	"encoding/base64"
)

// NewSessionToken returns a 256-bit URL-safe random token. Opaque and
// unguessable — the session's security rests on this value plus server-side
// storage, so no signing secret is needed.
func NewSessionToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
