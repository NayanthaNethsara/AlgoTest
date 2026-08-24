package api

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

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
			if errors.Is(err, team.ErrDuplicateTeamName) {
				c.JSON(http.StatusConflict, gin.H{"error": "team name already exists"})
				return
			}
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
		if errors.Is(err, team.ErrDuplicateTeamName) {
			c.JSON(http.StatusConflict, gin.H{"error": "team name already exists"})
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
