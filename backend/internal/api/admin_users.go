package api

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/audit"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/auth"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

var (
	errInvalidRole             = errors.New("invalid role")
	errTeamRequired            = errors.New("team is required for competitor users")
	errAdminCreationNotAllowed = errors.New("admin accounts cannot be created via API; use server CLI")
)

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
		h.writeCreateError(c, err)
		return
	}
	h.recordAudit(c, audit.ActionUserCreate, audit.TargetUser, created.ID, audit.StatusSuccess, map[string]interface{}{
		"username": created.Username,
		"role":     created.Role,
		"teamId":   created.TeamID,
	})
	c.JSON(http.StatusCreated, gin.H{"user": created, "password": password})
}

type bulkCreateRequest struct {
	TeamID   string              `json:"teamId"`
	TeamName string              `json:"teamName"`
	Users    []createUserRequest `json:"users" binding:"required"`
}

type bulkResult struct {
	Username string     `json:"username"`
	Status   string     `json:"status"`
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

	if len(req.Users) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no users provided in payload"})
		return
	}
	if len(req.Users) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot import more than 500 users at once"})
		return
	}

	seenInBatch := make(map[string]struct{})
	results := make([]bulkResult, 0, len(req.Users))
	for _, row := range req.Users {
		row.Role = user.RoleCompetitor
		if row.TeamID == "" && row.TeamName == "" {
			row.TeamID = req.TeamID
			row.TeamName = req.TeamName
		}
		trimmedUsername := strings.TrimSpace(row.Username)
		lowerUser := strings.ToLower(trimmedUsername)
		if trimmedUsername != "" {
			if _, exists := seenInBatch[lowerUser]; exists {
				results = append(results, bulkResult{
					Username: trimmedUsername,
					Status:   "error",
					Error:    "duplicate username in import file",
				})
				continue
			}
			seenInBatch[lowerUser] = struct{}{}
		}

		created, password, err := h.createOne(c, row)
		if err != nil {
			results = append(results, bulkResult{Username: row.Username, Status: "error", Error: err.Error()})
			continue
		}
		u := created
		results = append(results, bulkResult{Username: u.Username, Status: "created", Password: password, User: &u})
	}
	h.recordAudit(c, audit.ActionUserBulkCreate, audit.TargetUser, "", audit.StatusSuccess, map[string]interface{}{
		"count": len(results),
	})
	c.JSON(http.StatusOK, gin.H{"results": results})
}

type bulkUserActionRequest struct {
	UserIDs    []string `json:"userIds" binding:"required"`
	Action     string   `json:"action" binding:"required"`
	Reason     string   `json:"reason"`
	HoursValid int      `json:"hoursValid"`
}

// @Summary Admin Bulk User Action
// @Description Execute a batch operation across multiple competitor accounts.
// @Tags Admin
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param payload body bulkUserActionRequest true "Bulk user action payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Router /api/v1/admin/users/bulk-action [post]
func (h *handler) bulkUserAction(c *gin.Context) {
	var req bulkUserActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.UserIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no user ids provided"})
		return
	}
	if len(req.UserIDs) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot process more than 500 users at once"})
		return
	}

	curr := currentUser(c)
	validIDs := make([]string, 0, len(req.UserIDs))
	seen := make(map[string]struct{}, len(req.UserIDs))
	for _, id := range req.UserIDs {
		trimmed := strings.TrimSpace(id)
		if trimmed == "" || trimmed == curr.ID {
			continue
		}
		if _, exists := seen[trimmed]; !exists {
			seen[trimmed] = struct{}{}
			validIDs = append(validIDs, trimmed)
		}
	}

	if len(validIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no valid target user ids provided"})
		return
	}

	if req.HoursValid < 0 || req.HoursValid > MaxAccessGrantHours {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("hoursValid must be between 0 and %d", MaxAccessGrantHours),
		})
		return
	}

	ctx := c.Request.Context()
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		reason = "Bulk operation by administrator"
	}

	var affected int64
	var err error

	switch req.Action {
	case "allow_web_only":
		affected, err = h.users.BulkUpdateProctorAccess(ctx, validIDs, true, reason, req.HoursValid, curr.ID)
	case "require_desktop":
		affected, err = h.users.BulkUpdateProctorAccess(ctx, validIDs, false, "", 0, curr.ID)
	case "exempt_proctor":
		affected, err = h.users.BulkUpdateProctorExemption(ctx, validIDs, true, req.HoursValid, reason, curr.ID)
	case "enforce_proctor":
		affected, err = h.users.BulkUpdateProctorExemption(ctx, validIDs, false, 0, "", curr.ID)
	case "suspend":
		affected, err = h.users.BulkUpdateSuspension(ctx, validIDs, true, reason)
		if err == nil {
			if sessErr := h.sessions.DeleteByUsers(ctx, validIDs); sessErr != nil {
				log.Printf("failed to revoke sessions on bulk suspension: %v", sessErr)
			}
		}
	case "restore":
		affected, err = h.users.BulkUpdateSuspension(ctx, validIDs, false, "")
	case "delete":
		affected, err = h.users.BulkDelete(ctx, validIDs)
		if err == nil {
			if sessErr := h.sessions.DeleteByUsers(ctx, validIDs); sessErr != nil {
				log.Printf("failed to revoke sessions on bulk delete: %v", sessErr)
			}
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid action"})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.recordAudit(c, audit.ActionUserBulkAction, audit.TargetUser, "", audit.StatusSuccess, map[string]interface{}{
		"action":   req.Action,
		"affected": affected,
		"reason":   req.Reason,
	})

	c.JSON(http.StatusOK, gin.H{
		"status":   "ok",
		"action":   req.Action,
		"affected": affected,
	})
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

	id := c.Param("id")
	ctx := c.Request.Context()
	targetUser, err := h.users.GetByID(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if targetUser.Role == user.RoleAdmin && id != currentUser(c).ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "cannot reset another admin's password via API; use server CLI"})
		return
	}

	minPasswordLen := user.MinPasswordLength
	if targetUser.Role == user.RoleAdmin {
		minPasswordLen = 12
	}

	if req.Password != "" && len(req.Password) < minPasswordLen {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("password must be at least %d characters", minPasswordLen)})
		return
	}

	password := req.Password
	if password == "" {
		length := user.GeneratedPasswordLength
		if targetUser.Role == user.RoleAdmin {
			length = 14
		}
		password = auth.GeneratePassword(length)
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	if err := h.users.UpdatePassword(ctx, id, hash); err != nil {
		h.writeUpdateError(c, err)
		return
	}
	if err := h.sessions.DeleteByUser(ctx, id); err != nil {
		log.Printf("failed to delete sessions for user %s: %v", id, err)
	}

	h.recordAudit(c, audit.ActionUserResetPassword, audit.TargetUser, id, audit.StatusSuccess, map[string]interface{}{
		"username": targetUser.Username,
	})

	c.JSON(http.StatusOK, gin.H{"password": password})
}

type roleRequest struct {
	Role string `json:"role" binding:"required"`
}

// @Summary Admin Update User Role
// @Description Update user role (competitor or admin).
// @Tags Admin
// @Accept json
// @Produce json
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
	if req.Role == user.RoleAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "admin role cannot be granted via API; use server CLI"})
		return
	}
	id := c.Param("id")
	if id == currentUser(c).ID && req.Role != user.RoleAdmin {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot demote yourself"})
		return
	}
	if err := h.users.UpdateRole(c.Request.Context(), id, req.Role); err != nil {
		h.writeUpdateError(c, err)
		return
	}
	if err := h.sessions.DeleteByUser(c.Request.Context(), id); err != nil {
		log.Printf("failed to revoke sessions on role update for user %s: %v", id, err)
	}
	h.recordAudit(c, audit.ActionUserRoleUpdate, audit.TargetUser, id, audit.StatusSuccess, map[string]interface{}{
		"newRole": req.Role,
	})
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

	ctx := c.Request.Context()
	targetUser, err := h.users.GetByID(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if targetUser.Role == user.RoleAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "admin accounts cannot be deleted via API; use server CLI"})
		return
	}

	if err := h.users.Delete(ctx, id); err != nil {
		h.writeUpdateError(c, err)
		return
	}
	if err := h.sessions.DeleteByUser(ctx, id); err != nil {
		log.Printf("failed to revoke sessions on delete for user %s: %v", id, err)
	}
	h.recordAudit(c, audit.ActionUserDelete, audit.TargetUser, id, audit.StatusSuccess, map[string]interface{}{
		"username": targetUser.Username,
	})
	c.Status(http.StatusNoContent)
}

type suspendRequest struct {
	Suspended bool   `json:"suspended"`
	Reason    string `json:"reason"`
}

// @Summary Admin Suspend User
// @Description Temporarily block or unblock user access.
// @Tags Admin
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "User ID"
// @Param payload body suspendRequest true "Suspension payload"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/v1/admin/users/{id}/suspend [patch]
func (h *handler) suspendUser(c *gin.Context) {
	var req suspendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id := c.Param("id")
	if id == currentUser(c).ID && req.Suspended {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot suspend yourself"})
		return
	}

	ctx := c.Request.Context()
	targetUser, err := h.users.GetByID(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if targetUser.Role == user.RoleAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "admin accounts cannot be suspended via API; use server CLI"})
		return
	}

	if err := h.users.UpdateSuspension(ctx, id, req.Suspended, strings.TrimSpace(req.Reason)); err != nil {
		h.writeUpdateError(c, err)
		return
	}

	if req.Suspended {
		if err := h.sessions.DeleteByUser(ctx, id); err != nil {
			log.Printf("failed to revoke sessions on suspension for user %s: %v", id, err)
		}
	}

	action := audit.ActionUserRestore
	if req.Suspended {
		action = audit.ActionUserSuspend
	}
	h.recordAudit(c, action, audit.TargetUser, id, audit.StatusSuccess, map[string]interface{}{
		"username": targetUser.Username,
		"reason":   req.Reason,
	})

		c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *handler) createOne(c *gin.Context, req createUserRequest) (user.User, string, error) {
	req.Username = strings.TrimSpace(req.Username)
	if err := user.ValidateUsername(req.Username); err != nil {
		return user.User{}, "", err
	}
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if len(req.DisplayName) > user.MaxDisplayNameLength {
		return user.User{}, "", user.ErrDisplayNameLength
	}
	req.TeamName = strings.TrimSpace(req.TeamName)
	if len(req.TeamName) > team.MaxTeamNameLength {
		return user.User{}, "", team.ErrTeamNameTooLong
	}

	role := req.Role
	if role == "" {
		role = user.RoleCompetitor
	}
	if role != user.RoleCompetitor {
		return user.User{}, "", errAdminCreationNotAllowed
	}
	if err := user.CheckPasswordLength(req.Password); err != nil {
		return user.User{}, "", err
	}

	name := req.DisplayName
	if name == "" {
		name = req.Username
	}
	password := req.Password
	if password == "" {
		password = auth.GeneratePassword(user.GeneratedPasswordLength)
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
			return user.User{}, "", err
		}
		if len(t.Members) >= team.MaxTeamMembers {
			return user.User{}, "", team.ErrTeamFull
		}
		targetTeamID = t.ID
		targetTeamName = t.Name
	} else if req.TeamName != "" {
		t, err := h.teams.GetByName(ctx, req.TeamName)
		if err != nil {
			if !errors.Is(err, team.ErrTeamNotFound) {
				return user.User{}, "", err
			}
			createdTeam, err := h.teams.CreateTeam(ctx, req.TeamName)
			if err != nil {
				return user.User{}, "", err
			}
			targetTeamID = createdTeam.ID
			targetTeamName = createdTeam.Name
		} else {
			if len(t.Members) >= team.MaxTeamMembers {
				return user.User{}, "", team.ErrTeamFull
			}
			targetTeamID = t.ID
			targetTeamName = t.Name
		}
	} else if role == user.RoleCompetitor {
		return user.User{}, "", errTeamRequired
	}

	var teamIDPtr *string
	if targetTeamID != "" {
		teamIDPtr = &targetTeamID
	}

	created, err := h.users.CreateWithTeam(ctx, req.Username, name, hash, role, teamIDPtr)
	if err != nil {
		return user.User{}, "", err
	}
	created.TeamName = &targetTeamName
	return created, password, nil
}

func (h *handler) writeCreateError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, user.ErrDuplicateUsername):
		h.respondError(c, http.StatusConflict, "username already exists", err)
	case errors.Is(err, errAdminCreationNotAllowed):
		h.respondError(c, http.StatusForbidden, "admin accounts cannot be created via API; use server CLI", err)
	case errors.Is(err, user.ErrUsernameRequired),
		errors.Is(err, user.ErrUsernameLength),
		errors.Is(err, user.ErrUsernameInvalid),
		errors.Is(err, user.ErrDisplayNameLength),
		errors.Is(err, team.ErrTeamNameTooLong):
		h.respondError(c, http.StatusBadRequest, err.Error(), err)
	case errors.Is(err, errInvalidRole):
		h.respondError(c, http.StatusBadRequest, "invalid role", err)
	case errors.Is(err, user.ErrPasswordTooShort):
		h.respondError(c, http.StatusBadRequest, "password too short (min 8 characters)", err)
	case errors.Is(err, errTeamRequired):
		h.respondError(c, http.StatusBadRequest, "team is required for competitor users", err)
	case errors.Is(err, team.ErrTeamNotFound):
		h.respondError(c, http.StatusNotFound, "team not found", err)
	case errors.Is(err, team.ErrTeamFull):
		h.respondError(c, http.StatusBadRequest, "team capacity reached (max 3 members)", err)
	case errors.Is(err, team.ErrUserAlreadyInTeam):
		h.respondError(c, http.StatusConflict, "user is already assigned to a team", err)
	default:
		h.respondError(c, http.StatusInternalServerError, "failed to create user", err)
	}
}

func (h *handler) writeUpdateError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, user.ErrNotFound):
		h.respondError(c, http.StatusNotFound, "user not found", err)
	case errors.Is(err, team.ErrTeamNotFound):
		h.respondError(c, http.StatusNotFound, "team not found", err)
	case errors.Is(err, team.ErrTeamFull):
		h.respondError(c, http.StatusBadRequest, "team capacity reached (max 3 members)", err)
	case errors.Is(err, team.ErrUserAlreadyInTeam):
		h.respondError(c, http.StatusConflict, "user is already assigned to a team", err)
	default:
		h.respondError(c, http.StatusInternalServerError, "operation failed", err)
	}
}
