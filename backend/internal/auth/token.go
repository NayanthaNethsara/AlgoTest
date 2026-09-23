package auth

import (
	"github.com/NayanthaNethsara/labyrithm/backend/internal/crypto"
)

// NewSessionToken returns a 256-bit URL-safe random token. Opaque and
// unguessable — the session's security rests on this value plus server-side
// storage, so no signing secret is needed.
func NewSessionToken() (string, error) {
	return crypto.RandomURLSafe(32)
}
