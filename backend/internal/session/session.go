package session

import (
	"crypto/sha256"
	"encoding/hex"
	"time"
)

type Session struct {
	UserID    string
	ExpiresAt time.Time
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
