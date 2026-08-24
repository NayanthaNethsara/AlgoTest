package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// @Summary Get Contest State
// @Description Fetch the current contest lifecycle state, countdown timer, and server timestamp.
// @Tags Contest
// @Produce json
// @Success 200 {object} contest.ContestState
// @Router /api/v1/contest/state [get]
func (h *handler) getContestState(c *gin.Context) {
	state := h.contest.GetState()
	c.JSON(http.StatusOK, state)
}
