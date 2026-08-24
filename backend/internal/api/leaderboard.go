package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

// @Summary Get Leaderboard Standings
// @Description Retrieve team leaderboard ranked by best scores per problem with freeze metadata.
// @Tags Leaderboard
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/leaderboard [get]
func (h *handler) getLeaderboard(c *gin.Context) {
	u := currentUser(c)

	var cutoff *time.Time
	isFrozen := false
	status := ""
	if h.contest != nil {
		cState := h.contest.GetState()
		isFrozen = cState.IsFrozen
		status = cState.Status
		if isFrozen && u.Role != user.RoleAdmin && cState.FreezeStartTime != nil {
			cutoff = cState.FreezeStartTime
		}
	}

	entries, err := h.teams.GetLeaderboardWithCutoff(c.Request.Context(), cutoff)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch leaderboard"})
		return
	}
	if entries == nil {
		entries = []team.LeaderboardEntry{}
	}

	c.JSON(http.StatusOK, gin.H{
		"leaderboard": entries,
		"isFrozen":    isFrozen,
		"status":      status,
	})
}
