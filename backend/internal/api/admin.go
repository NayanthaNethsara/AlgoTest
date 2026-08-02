package api

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/auth"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

const (
	generatedPasswordLength = 10
	minPasswordLength       = 8
)

var errPasswordTooShort = errors.New("password too short")

func checkPasswordLength(password string) error {
	if password != "" && len(password) < minPasswordLength {
		return errPasswordTooShort
	}
	return nil
}

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

// @Summary Admin List Users
// @Description Fetch all user accounts and team assignments.
// @Tags Admin
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string][]user.User
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Router /api/v1/admin/users [get]
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

// @Summary Admin Create User
// @Description Create a single user account.
// @Tags Admin
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param payload body createUserRequest true "User creation payload"
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Router /api/v1/admin/users [post]
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
	Role  string              `json:"role"`
	Users []createUserRequest `json:"users" binding:"required"`
}

type bulkResult struct {
	Username string     `json:"username"`
	Status   string     `json:"status"` // created | error
	Error    string     `json:"error,omitempty"`
	Password string     `json:"password,omitempty"`
	User     *user.User `json:"user,omitempty"`
}

// @Summary Admin Bulk Create Users
// @Description Bulk create user accounts.
// @Tags Admin
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param payload body bulkCreateRequest true "Bulk user creation payload"
// @Success 200 {object} map[string][]bulkResult
// @Router /api/v1/admin/users/bulk [post]
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

// @Summary Admin Reset Password
// @Description Reset user password and invalidate all active sessions.
// @Tags Admin
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "User ID"
// @Param payload body passwordRequest false "New password"
// @Success 200 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/v1/admin/users/{id}/reset-password [post]
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
	_ = h.sessions.DeleteByUser(ctx, id)

	c.JSON(http.StatusOK, gin.H{"password": password})
}

type roleRequest struct {
	Role string `json:"role" binding:"required"`
}

// @Summary Admin Update User Role
// @Description Update user role (competitor or admin).
// @Tags Admin
// @Accept json
// @Security BearerAuth
// @Param id path string true "User ID"
// @Param payload body roleRequest true "Role payload"
// @Success 244 "No Content"
// @Failure 400 {object} map[string]string
// @Router /api/v1/admin/users/{id}/role [patch]
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

// @Summary Admin Delete User
// @Description Delete user account.
// @Tags Admin
// @Security BearerAuth
// @Param id path string true "User ID"
// @Success 244 "No Content"
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/v1/admin/users/{id} [delete]
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

type teamMemberRequest struct {
	Username    string `json:"username" binding:"required"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
}

type createTeamRequest struct {
	Name    string              `json:"name" binding:"required"`
	Members []teamMemberRequest `json:"members" binding:"required"`
}

// @Summary Admin Create Team with Members
// @Description Atomically create a team and 1 to 3 member user accounts.
// @Tags Admin
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param payload body createTeamRequest true "Team creation payload"
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Router /api/v1/admin/teams [post]
func (h *handler) createTeam(c *gin.Context) {
	var req createTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.Members) < 1 || len(req.Members) > team.MaxTeamMembers {
		c.JSON(http.StatusBadRequest, gin.H{"error": "a team must have between 1 and 3 members"})
		return
	}

	ctx := c.Request.Context()
	t, err := h.teams.CreateTeam(ctx, req.Name)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	type createdMember struct {
		User     user.User `json:"user"`
		Password string    `json:"password"`
	}
	var created []createdMember

	for _, m := range req.Members {
		pw := m.Password
		if pw == "" {
			pw = auth.GeneratePassword(generatedPasswordLength)
		}
		hash, err := auth.HashPassword(pw)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}
		displayName := m.DisplayName
		if displayName == "" {
			displayName = m.Username
		}
		u, err := h.users.CreateWithTeam(ctx, m.Username, displayName, hash, user.RoleCompetitor, &t.ID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		created = append(created, createdMember{User: u, Password: pw})
	}

	c.JSON(http.StatusCreated, gin.H{"team": t, "members": created})
}

type createAdminRequest struct {
	Username    string `json:"username" binding:"required"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
}

// @Summary Admin Create Administrator Account
// @Description Create an administrator account without a team assignment.
// @Tags Admin
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param payload body createAdminRequest true "Admin account payload"
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Router /api/v1/admin/admins [post]
func (h *handler) createAdminUser(c *gin.Context) {
	var req createAdminRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	created, password, err := h.createOne(c, createUserRequest{
		Username:    req.Username,
		DisplayName: req.DisplayName,
		Password:    req.Password,
		Role:        user.RoleAdmin,
	})
	if err != nil {
		writeCreateError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"admin": created, "password": password})
}
