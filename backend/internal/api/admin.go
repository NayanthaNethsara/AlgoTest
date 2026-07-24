package api

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/auth"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

const (
	generatedPasswordLength = 10
	minPasswordLength       = 8
)

var errPasswordTooShort = errors.New("password too short")

// checkPasswordLength validates an explicitly supplied password. Empty means
// "generate one", which is always long enough, so it passes.
func checkPasswordLength(password string) error {
	if password != "" && len(password) < minPasswordLength {
		return errPasswordTooShort
	}
	return nil
}

// requireAdmin runs after requireUser and rejects non-admins.
func (h *handler) requireAdmin(c *gin.Context) {
	if currentUser(c).Role != user.RoleAdmin {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin only"})
		return
	}
	c.Next()
}

func currentUser(c *gin.Context) user.User {
	return c.MustGet(contextUserKey).(user.User)
}

func (h *handler) listUsers(c *gin.Context) {
	users, err := h.users.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list users"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"users": users})
}

type createUserRequest struct {
	Username    string `json:"username" binding:"required"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
	Password    string `json:"password"`
}

func (h *handler) createUser(c *gin.Context) {
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	created, password, err := h.createOne(c, req)
	if err != nil {
		writeCreateError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"user": created, "password": password})
}

type bulkCreateRequest struct {
	Role  string               `json:"role"`
	Users []createUserRequest `json:"users" binding:"required"`
}

type bulkResult struct {
	Username string     `json:"username"`
	Status   string     `json:"status"` // created | error
	Error    string     `json:"error,omitempty"`
	Password string     `json:"password,omitempty"`
	User     *user.User `json:"user,omitempty"`
}

func (h *handler) bulkCreateUsers(c *gin.Context) {
	var req bulkCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	results := make([]bulkResult, 0, len(req.Users))
	for _, row := range req.Users {
		if row.Role == "" {
			row.Role = req.Role
		}
		created, password, err := h.createOne(c, row)
		if err != nil {
			results = append(results, bulkResult{Username: row.Username, Status: "error", Error: err.Error()})
			continue
		}
		u := created
		results = append(results, bulkResult{Username: u.Username, Status: "created", Password: password, User: &u})
	}
	c.JSON(http.StatusOK, gin.H{"results": results})
}

type passwordRequest struct {
	Password string `json:"password"`
}

func (h *handler) resetPassword(c *gin.Context) {
	var req passwordRequest
	_ = c.ShouldBindJSON(&req)

	if err := checkPasswordLength(req.Password); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password too short"})
		return
	}

	password := req.Password
	if password == "" {
		password = auth.GeneratePassword(generatedPasswordLength)
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	ctx := c.Request.Context()
	id := c.Param("id")
	if err := h.users.UpdatePassword(ctx, id, hash); err != nil {
		writeUpdateError(c, err)
		return
	}
	// Force re-login everywhere: any session opened with the old password
	// (e.g. an attacker's) is now invalid.
	_ = h.sessions.DeleteByUser(ctx, id)

	c.JSON(http.StatusOK, gin.H{"password": password})
}

type roleRequest struct {
	Role string `json:"role" binding:"required"`
}

func (h *handler) updateRole(c *gin.Context) {
	var req roleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !user.ValidRole(req.Role) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}
	id := c.Param("id")
	if id == currentUser(c).ID && req.Role != user.RoleAdmin {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot demote yourself"})
		return
	}
	if err := h.users.UpdateRole(c.Request.Context(), id, req.Role); err != nil {
		writeUpdateError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *handler) deleteUser(c *gin.Context) {
	id := c.Param("id")
	if id == currentUser(c).ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete yourself"})
		return
	}
	if err := h.users.Delete(c.Request.Context(), id); err != nil {
		writeUpdateError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// createOne creates a user, generating a password when none is supplied, and
// returns the stored user plus the effective password to hand out.
func (h *handler) createOne(c *gin.Context, req createUserRequest) (user.User, string, error) {
	role := req.Role
	if role == "" {
		role = user.RoleCompetitor
	}
	if !user.ValidRole(role) {
		return user.User{}, "", errInvalidRole
	}
	if err := checkPasswordLength(req.Password); err != nil {
		return user.User{}, "", err
	}

	name := req.DisplayName
	if name == "" {
		name = req.Username
	}
	password := req.Password
	if password == "" {
		password = auth.GeneratePassword(generatedPasswordLength)
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return user.User{}, "", err
	}
	created, err := h.users.Create(c.Request.Context(), req.Username, name, hash, role)
	if err != nil {
		return user.User{}, "", err
	}
	return created, password, nil
}

var errInvalidRole = errors.New("invalid role")

func writeCreateError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, user.ErrDuplicateUsername):
		c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
	case errors.Is(err, errInvalidRole):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
	case errors.Is(err, errPasswordTooShort):
		c.JSON(http.StatusBadRequest, gin.H{"error": "password too short (min 8 characters)"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
	}
}

func writeUpdateError(c *gin.Context, err error) {
	if errors.Is(err, user.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "operation failed"})
}
