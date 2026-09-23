package session

import (
	"time"

	"github.com/NayanthaNethsara/labyrithm/backend/internal/crypto"
)

type Session struct {
	UserID    string
	ExpiresAt time.Time
}

func hashToken(token string) string {
	return crypto.HashToken(token)
}
