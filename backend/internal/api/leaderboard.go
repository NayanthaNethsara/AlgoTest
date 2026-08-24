package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
)

// @Summary Get Leaderboard Standings
// @Description Retrieve team leaderboard ranked by best scores per problem with freeze metadata.
// @Tags Leaderboard
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/leaderboard [get]
func (h *handler) getLeaderboard(c *gin.Context) {
	entries, err := h.teams.GetLeaderboard(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch leaderboard"})
		return
	}
	if entries == nil {
		entries = []team.LeaderboardEntry{}
	}

	isFrozen := false
	status := ""
	if h.contest != nil {
		cState := h.contest.GetState()
		isFrozen = cState.IsFrozen
		status = cState.Status
	}

	c.JSON(http.StatusOK, gin.H{
		"leaderboard": entries,
		"isFrozen":    isFrozen,
		"status":      status,
	})
}
