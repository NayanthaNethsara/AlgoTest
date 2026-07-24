package user

import "time"

const (
	RoleCompetitor = "competitor"
	RoleAdmin      = "admin"
)

// ValidRole reports whether role is one of the known roles.
func ValidRole(role string) bool {
	return role == RoleCompetitor || role == RoleAdmin
}

// User is a competitor or organizer. The password hash is never included in
// the JSON representation.
type User struct {
	ID          string     `json:"id"`
	Username    string     `json:"username"`
	DisplayName string     `json:"displayName"`
	Role        string     `json:"role"`
	CreatedAt   time.Time  `json:"createdAt"`
	LastLoginAt *time.Time `json:"lastLoginAt,omitempty"`
}
