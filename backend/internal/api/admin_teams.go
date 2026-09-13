package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/audit"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/auth"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

type teamMemberRequest struct {
	Username    string `json:"username" binding:"required"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
}

type createTeamRequest struct {
	Name    string              `json:"name" binding:"required"`
	Members []teamMemberRequest `json:"members"`
}

type createdMember struct {
	User     user.User `json:"user"`
	Password string    `json:"password"`
}

type bulkCreateTeamsRequest struct {
	Teams []createTeamRequest `json:"teams" binding:"required"`
}

type bulkTeamResultItem struct {
	Name    string          `json:"name"`
	Status  string          `json:"status"`
	Error   string          `json:"error,omitempty"`
	Team    *team.Team      `json:"team,omitempty"`
	Members []createdMember `json:"members,omitempty"`
}

type updateTeamRequest struct {
	Name string `json:"name" binding:"required"`
}

type addTeamMemberRequest struct {
	UserID      string `json:"userId"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
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

	t, created, err := h.createTeamOne(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, team.ErrDuplicateTeamName) {
			c.JSON(http.StatusConflict, gin.H{"error": "team name already exists"})
			return
		}
		if errors.Is(err, user.ErrDuplicateUsername) {
			c.JSON(http.StatusConflict, gin.H{"error": "one of the member usernames already exists"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.recordAudit(c, audit.ActionTeamCreate, audit.TargetTeam, t.ID, audit.StatusSuccess, map[string]interface{}{
		"name":        t.Name,
		"memberCount": len(created),
	})

	c.JSON(http.StatusCreated, gin.H{"team": t, "members": created})
}

// @Summary Admin Bulk Create Teams
// @Description Bulk create teams with optional initial members.
// @Tags Admin
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param payload body bulkCreateTeamsRequest true "Bulk team creation payload"
// @Success 200 {object} map[string][]bulkTeamResultItem
// @Failure 400 {object} map[string]string
// @Router /api/v1/admin/teams/bulk [post]
func (h *handler) bulkCreateTeams(c *gin.Context) {
	var req bulkCreateTeamsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.Teams) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no teams provided in payload"})
		return
	}
	if len(req.Teams) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot import more than 200 teams at once"})
		return
	}

	seenTeamNames := make(map[string]struct{})
	results := make([]bulkTeamResultItem, 0, len(req.Teams))

	for _, tReq := range req.Teams {
		trimmedName := strings.TrimSpace(tReq.Name)
		lowerName := strings.ToLower(trimmedName)

		if trimmedName != "" {
			if _, exists := seenTeamNames[lowerName]; exists {
				results = append(results, bulkTeamResultItem{
					Name:   trimmedName,
					Status: "error",
					Error:  "duplicate team name in batch payload",
				})
				continue
			}
			seenTeamNames[lowerName] = struct{}{}
		}

		t, members, err := h.createTeamOne(c.Request.Context(), tReq)
		if err != nil {
			errMsg := err.Error()
			if errors.Is(err, team.ErrDuplicateTeamName) {
				errMsg = "team name already exists"
			} else if errors.Is(err, user.ErrDuplicateUsername) {
				errMsg = "one of the member usernames already exists"
			}
			results = append(results, bulkTeamResultItem{
				Name:   trimmedName,
				Status: "error",
				Error:  errMsg,
			})
			continue
		}

		results = append(results, bulkTeamResultItem{
			Name:    t.Name,
			Status:  "created",
			Team:    t,
			Members: members,
		})
	}

	h.recordAudit(c, audit.ActionTeamBulkCreate, audit.TargetTeam, "", audit.StatusSuccess, map[string]interface{}{
		"count": len(results),
	})
	c.JSON(http.StatusOK, gin.H{"results": results})
}

func (h *handler) updateTeam(c *gin.Context) {
	id := c.Param("id")
	var req updateTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "team name cannot be empty"})
		return
	}
	if len(req.Name) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "team name cannot exceed 100 characters"})
		return
	}
	t, err := h.teams.UpdateTeam(c.Request.Context(), id, req.Name)
	if err != nil {
		if errors.Is(err, team.ErrTeamNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
			return
		}
		if errors.Is(err, team.ErrDuplicateTeamName) {
			c.JSON(http.StatusConflict, gin.H{"error": "team name already exists"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.recordAudit(c, audit.ActionTeamUpdate, audit.TargetTeam, t.ID, audit.StatusSuccess, map[string]interface{}{
		"name": t.Name,
	})
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
	h.recordAudit(c, audit.ActionTeamDelete, audit.TargetTeam, id, audit.StatusSuccess, nil)
	c.JSON(http.StatusOK, gin.H{"message": "team deleted successfully"})
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
		h.recordAudit(c, audit.ActionTeamMemberAdd, audit.TargetTeam, teamID, audit.StatusSuccess, map[string]interface{}{
			"userId": req.UserID,
		})
		c.JSON(http.StatusOK, gin.H{"team": t})
		return
	}

	if req.Username != "" {
		trimmedUsername := strings.TrimSpace(req.Username)
		if err := user.ValidateUsername(trimmedUsername); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		req.Username = trimmedUsername

		trimmedDisplayName := strings.TrimSpace(req.DisplayName)
		if len(trimmedDisplayName) > user.MaxDisplayNameLength {
			c.JSON(http.StatusBadRequest, gin.H{"error": user.ErrDisplayNameLength.Error()})
			return
		}

		if err := user.CheckPasswordLength(req.Password); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		pw := req.Password
		if pw == "" {
			pw = auth.GeneratePassword(user.GeneratedPasswordLength)
		}
		hash, err := auth.HashPassword(pw)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}

		displayName := trimmedDisplayName
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

		h.recordAudit(c, audit.ActionTeamMemberAdd, audit.TargetTeam, teamID, audit.StatusSuccess, map[string]interface{}{
			"userId":   createdUser.ID,
			"username": createdUser.Username,
		})
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

	h.recordAudit(c, audit.ActionTeamMemberRemove, audit.TargetTeam, teamID, audit.StatusSuccess, map[string]interface{}{
		"userId": userID,
	})
	c.JSON(http.StatusOK, gin.H{"team": t})
}

func (h *handler) createTeamOne(ctx context.Context, req createTeamRequest) (*team.Team, []createdMember, error) {
	req.Name = strings.TrimSpace(req.Name)
	if err := team.ValidateTeamName(req.Name); err != nil {
		return nil, nil, err
	}
	if len(req.Members) > team.MaxTeamMembers {
		return nil, nil, fmt.Errorf("a team can have at most %d members", team.MaxTeamMembers)
	}

	if len(req.Members) == 0 {
		t, err := h.teams.CreateTeam(ctx, req.Name)
		if err != nil {
			return nil, nil, err
		}
		return t, []createdMember{}, nil
	}

	seenMemberUsernames := make(map[string]struct{})
	memberParams := make([]team.CreateMemberParams, 0, len(req.Members))
	passwords := make([]string, 0, len(req.Members))

	for _, m := range req.Members {
		trimmedUser := strings.TrimSpace(m.Username)
		if err := user.ValidateUsername(trimmedUser); err != nil {
			return nil, nil, fmt.Errorf("invalid member username '%s': %w", m.Username, err)
		}
		lowerUser := strings.ToLower(trimmedUser)
		if _, exists := seenMemberUsernames[lowerUser]; exists {
			return nil, nil, fmt.Errorf("duplicate member username '%s' in team payload", trimmedUser)
		}
		seenMemberUsernames[lowerUser] = struct{}{}

		trimmedDisplayName := strings.TrimSpace(m.DisplayName)
		if len(trimmedDisplayName) > user.MaxDisplayNameLength {
			return nil, nil, user.ErrDisplayNameLength
		}
		if trimmedDisplayName == "" {
			trimmedDisplayName = trimmedUser
		}

		if err := user.CheckPasswordLength(m.Password); err != nil {
			return nil, nil, err
		}

		pw := m.Password
		if pw == "" {
			pw = auth.GeneratePassword(user.GeneratedPasswordLength)
		}
		hash, err := auth.HashPassword(pw)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to hash password: %w", err)
		}

		memberParams = append(memberParams, team.CreateMemberParams{
			Username:     trimmedUser,
			DisplayName:  trimmedDisplayName,
			PasswordHash: hash,
			Role:         user.RoleCompetitor,
		})
		passwords = append(passwords, pw)
	}

	t, createdUsers, err := h.teams.CreateTeamWithMembers(ctx, req.Name, memberParams)
	if err != nil {
		return nil, nil, err
	}

	created := make([]createdMember, len(createdUsers))
	for i, u := range createdUsers {
		created[i] = createdMember{User: u, Password: passwords[i]}
	}
	return t, created, nil
}
