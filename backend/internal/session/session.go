package session

import (
	"time"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/crypto"
)

type Session struct {
	UserID    string
	ExpiresAt time.Time
}

func hashToken(token string) string {
	return crypto.HashToken(token)
}
