package api

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/auth"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

const (
	generatedPasswordLength = 10
	minPasswordLength       = 8
)

var (
	errPasswordTooShort        = errors.New("password too short")
	errInvalidRole             = errors.New("invalid role")
	errTeamRequired            = errors.New("team is required for competitor users")
	errAdminCreationNotAllowed = errors.New("admin accounts cannot be created via API; use server CLI")
)

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
	TeamID      string `json:"teamId"`
	TeamName    string `json:"teamName"`
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
	TeamID   string              `json:"teamId"`
	TeamName string              `json:"teamName"`
	Users    []createUserRequest `json:"users" binding:"required"`
}

type bulkResult struct {
	Username string     `json:"username"`
	Status   string     `json:"status"` // created | error
	Error    string     `json:"error,omitempty"`
	Password string     `json:"password,omitempty"`
	User     *user.User `json:"user,omitempty"`
}

// @Summary Admin Bulk Create Users
// @Description Bulk create competitor user accounts.
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
		row.Role = user.RoleCompetitor
		if row.TeamID == "" && row.TeamName == "" {
			row.TeamID = req.TeamID
			row.TeamName = req.TeamName
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
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json payload: " + err.Error()})
			return
		}
	}

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
	if err := h.sessions.DeleteByUser(ctx, id); err != nil {
		log.Printf("failed to delete sessions for user %s: %v", id, err)
	}

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
	if role != user.RoleCompetitor {
		return user.User{}, "", errAdminCreationNotAllowed
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

	ctx := c.Request.Context()

	var targetTeamID string
	var targetTeamName string

	if req.TeamID != "" {
		t, err := h.teams.GetByID(ctx, req.TeamID)
		if err != nil {
			if errors.Is(err, team.ErrTeamNotFound) {
				return user.User{}, "", team.ErrTeamNotFound
			}
			return user.User{}, "", fmt.Errorf("lookup team: %w", err)
		}
		if len(t.Members) >= team.MaxTeamMembers {
			return user.User{}, "", team.ErrTeamFull
		}
		targetTeamID = t.ID
		targetTeamName = t.Name
	} else if req.TeamName != "" {
		trimmedName := strings.TrimSpace(req.TeamName)
		if trimmedName == "" {
			return user.User{}, "", errTeamRequired
		}
		t, err := h.teams.GetByName(ctx, trimmedName)
		if err != nil {
			if errors.Is(err, team.ErrTeamNotFound) {
				newTeam, createErr := h.teams.CreateTeam(ctx, trimmedName)
				if createErr != nil {
					return user.User{}, "", fmt.Errorf("create team: %w", createErr)
				}
				targetTeamID = newTeam.ID
				targetTeamName = newTeam.Name
			} else {
				return user.User{}, "", fmt.Errorf("lookup team: %w", err)
			}
		} else {
			if len(t.Members) >= team.MaxTeamMembers {
				return user.User{}, "", team.ErrTeamFull
			}
			targetTeamID = t.ID
			targetTeamName = t.Name
		}
	} else {
		return user.User{}, "", errTeamRequired
	}

	created, err := h.users.CreateWithTeam(ctx, req.Username, name, hash, role, &targetTeamID)
	if err != nil {
		return user.User{}, "", err
	}
	created.TeamName = &targetTeamName
	return created, password, nil
}

func writeCreateError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, user.ErrDuplicateUsername):
		c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
	case errors.Is(err, errAdminCreationNotAllowed):
		c.JSON(http.StatusForbidden, gin.H{"error": "admin accounts cannot be created via API; use server CLI"})
	case errors.Is(err, errInvalidRole):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
	case errors.Is(err, errPasswordTooShort):
		c.JSON(http.StatusBadRequest, gin.H{"error": "password too short (min 8 characters)"})
	case errors.Is(err, errTeamRequired):
		c.JSON(http.StatusBadRequest, gin.H{"error": "team is required for competitor users"})
	case errors.Is(err, team.ErrTeamNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
	case errors.Is(err, team.ErrTeamFull):
		c.JSON(http.StatusBadRequest, gin.H{"error": "team capacity reached (max 3 members)"})
	case errors.Is(err, team.ErrUserAlreadyInTeam):
		c.JSON(http.StatusConflict, gin.H{"error": "user is already assigned to a team"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
	}
}

func writeUpdateError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, user.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
	case errors.Is(err, team.ErrTeamNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
	case errors.Is(err, team.ErrTeamFull):
		c.JSON(http.StatusBadRequest, gin.H{"error": "team capacity reached (max 3 members)"})
	case errors.Is(err, team.ErrUserAlreadyInTeam):
		c.JSON(http.StatusConflict, gin.H{"error": "user is already assigned to a team"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "operation failed"})
	}
}

type teamMemberRequest struct {
	Username    string `json:"username" binding:"required"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
}

type createTeamRequest struct {
	Name    string              `json:"name" binding:"required"`
	Members []teamMemberRequest `json:"members"`
}

func (h *handler) listAdminTeams(c *gin.Context) {
	teams, err := h.teams.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list teams"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"teams": teams})
}

// @Summary Admin Create Team with Optional Members
// @Description Atomically create a team with optional member user accounts.
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

	type createdMember struct {
		User     user.User `json:"user"`
		Password string    `json:"password"`
	}

	if len(req.Members) == 0 {
		t, err := h.teams.CreateTeam(c.Request.Context(), req.Name)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"team": t, "members": []createdMember{}})
		return
	}

	if len(req.Members) > team.MaxTeamMembers {
		c.JSON(http.StatusBadRequest, gin.H{"error": "a team can have at most 3 members"})
		return
	}

	memberParams := make([]team.CreateMemberParams, 0, len(req.Members))
	passwords := make([]string, 0, len(req.Members))

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
		memberParams = append(memberParams, team.CreateMemberParams{
			Username:     m.Username,
			DisplayName:  displayName,
			PasswordHash: hash,
			Role:         user.RoleCompetitor,
		})
		passwords = append(passwords, pw)
	}

	t, createdUsers, err := h.teams.CreateTeamWithMembers(c.Request.Context(), req.Name, memberParams)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	created := make([]createdMember, len(createdUsers))
	for i, u := range createdUsers {
		created[i] = createdMember{User: u, Password: passwords[i]}
	}

	c.JSON(http.StatusCreated, gin.H{"team": t, "members": created})
}

type updateTeamRequest struct {
	Name string `json:"name" binding:"required"`
}

func (h *handler) updateTeam(c *gin.Context) {
	id := c.Param("id")
	var req updateTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	t, err := h.teams.UpdateTeam(c.Request.Context(), id, req.Name)
	if err != nil {
		if errors.Is(err, team.ErrTeamNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"team": t})
}

func (h *handler) deleteTeam(c *gin.Context) {
	id := c.Param("id")
	err := h.teams.DeleteTeam(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, team.ErrTeamNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "team deleted successfully"})
}

type addTeamMemberRequest struct {
	UserID      string `json:"userId"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
}

func (h *handler) addTeamMember(c *gin.Context) {
	teamID := c.Param("id")
	var req addTeamMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.UserID != "" {
		err := h.teams.AddMember(c.Request.Context(), teamID, req.UserID)
		if err != nil {
			if errors.Is(err, team.ErrTeamFull) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "team capacity reached (max 3 members)"})
				return
			}
			if errors.Is(err, team.ErrUserAlreadyInTeam) {
				c.JSON(http.StatusConflict, gin.H{"error": "user is already assigned to a team"})
				return
			}
			if errors.Is(err, user.ErrNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "competitor user not found"})
				return
			}
			if errors.Is(err, team.ErrTeamNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		t, err := h.teams.GetByID(c.Request.Context(), teamID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch updated team"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"team": t})
		return
	}

	if req.Username != "" {
		if err := checkPasswordLength(req.Password); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		pw := req.Password
		if pw == "" {
			pw = auth.GeneratePassword(generatedPasswordLength)
		}
		hash, err := auth.HashPassword(pw)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}

		displayName := req.DisplayName
		if displayName == "" {
			displayName = req.Username
		}

		createdUser, err := h.teams.CreateAndAddMember(c.Request.Context(), teamID, team.CreateMemberParams{
			Username:     req.Username,
			DisplayName:  displayName,
			PasswordHash: hash,
			Role:         user.RoleCompetitor,
		})
		if err != nil {
			if errors.Is(err, user.ErrDuplicateUsername) {
				c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
				return
			}
			if errors.Is(err, team.ErrTeamFull) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "team capacity reached (max 3 members)"})
				return
			}
			if errors.Is(err, team.ErrTeamNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		t, err := h.teams.GetByID(c.Request.Context(), teamID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch updated team"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"team": t, "user": createdUser, "password": pw})
		return
	}

	c.JSON(http.StatusBadRequest, gin.H{"error": "userId or username must be provided"})
}

func (h *handler) removeTeamMember(c *gin.Context) {
	teamID := c.Param("id")
	userID := c.Param("userId")

	err := h.teams.RemoveMember(c.Request.Context(), teamID, userID)
	if err != nil {
		if errors.Is(err, user.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found in team"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	t, err := h.teams.GetByID(c.Request.Context(), teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch updated team"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"team": t})
}
