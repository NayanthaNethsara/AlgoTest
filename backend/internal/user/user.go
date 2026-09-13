package user

import (
	"errors"
	"strings"
	"time"
)

const (
	RoleCompetitor = "competitor"
	RoleAdmin      = "admin"

	MinPasswordLength       = 8
	GeneratedPasswordLength = 10
	MinUsernameLength       = 3
	MaxUsernameLength       = 50
	MaxDisplayNameLength    = 100
)

var (
	ErrUsernameRequired  = errors.New("username is required")
	ErrUsernameLength    = errors.New("username must be between 3 and 50 characters")
	ErrUsernameInvalid   = errors.New("username can only contain letters, numbers, underscores, and hyphens")
	ErrPasswordTooShort  = errors.New("password too short")
	ErrDisplayNameLength = errors.New("display name cannot exceed 100 characters")
)

// ValidRole reports whether role is one of the known roles.
func ValidRole(role string) bool {
	return role == RoleCompetitor || role == RoleAdmin
}

// ValidateUsername checks username boundaries and valid character rules.
func ValidateUsername(username string) error {
	trimmed := strings.TrimSpace(username)
	if trimmed == "" {
		return ErrUsernameRequired
	}
	if len(trimmed) < MinUsernameLength || len(trimmed) > MaxUsernameLength {
		return ErrUsernameLength
	}
	for _, ch := range trimmed {
		if !((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-') {
			return ErrUsernameInvalid
		}
	}
	return nil
}

// CheckPasswordLength validates that non-empty password meets minimum length requirements.
func CheckPasswordLength(password string) error {
	if password != "" && len(password) < MinPasswordLength {
		return ErrPasswordTooShort
	}
	return nil
}

// User is a competitor or organizer. The password hash is never included in
// the JSON representation.
type User struct {
	ID                   string     `json:"id"`
	Username             string     `json:"username"`
	DisplayName          string     `json:"displayName"`
	Role                 string     `json:"role"`
	CreatedAt            time.Time  `json:"createdAt"`
	LastLoginAt          *time.Time `json:"lastLoginAt,omitempty"`
	TeamID               *string    `json:"teamId,omitempty"`
	TeamName             *string    `json:"teamName,omitempty"`
	ProctorExempt        bool       `json:"proctorExempt"`
	ProctorAllowWebOnly  bool       `json:"proctorAllowWebOnly"`
	ProctorAccessReason  string     `json:"proctorAccessReason,omitempty"`
	IsSuspended          bool       `json:"isSuspended"`
	SuspendedReason      string     `json:"suspendedReason,omitempty"`
	SuspendedAt          *time.Time `json:"suspendedAt,omitempty"`
}
