package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/audit"
)

type startContestRequest struct {
	DurationMinutes int `json:"durationMinutes"`
}

// @Summary Admin Start Contest
// @Description Start the contest timer immediately with given or default duration.
// @Tags Admin Contest
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param payload body startContestRequest false "Start contest payload"
// @Success 200 {object} contest.ContestState
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/admin/contest/start [post]
func (h *handler) adminStartContest(c *gin.Context) {
	var req startContestRequest
	_ = c.ShouldBindJSON(&req)

	if err := h.contest.Start(c.Request.Context(), req.DurationMinutes); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.recordAudit(c, audit.ActionContestStart, audit.TargetContest, "", audit.StatusSuccess, map[string]interface{}{
		"durationMinutes": req.DurationMinutes,
	})
	c.JSON(http.StatusOK, h.contest.GetState())
}

// @Summary Admin Pause Contest
// @Description Pause the active contest timer.
// @Tags Admin Contest
// @Produce json
// @Security BearerAuth
// @Success 200 {object} contest.ContestState
// @Failure 400 {object} map[string]string
// @Router /api/v1/admin/contest/pause [post]
func (h *handler) adminPauseContest(c *gin.Context) {
	if err := h.contest.Pause(c.Request.Context()); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.recordAudit(c, audit.ActionContestPause, audit.TargetContest, "", audit.StatusSuccess, nil)
	c.JSON(http.StatusOK, h.contest.GetState())
}

// @Summary Admin Resume Contest
// @Description Resume a paused contest.
// @Tags Admin Contest
// @Produce json
// @Security BearerAuth
// @Success 200 {object} contest.ContestState
// @Failure 400 {object} map[string]string
// @Router /api/v1/admin/contest/resume [post]
func (h *handler) adminResumeContest(c *gin.Context) {
	if err := h.contest.Resume(c.Request.Context()); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.recordAudit(c, audit.ActionContestResume, audit.TargetContest, "", audit.StatusSuccess, nil)
	c.JSON(http.StatusOK, h.contest.GetState())
}

type extendContestRequest struct {
	Minutes int `json:"minutes" binding:"required"`
}

// @Summary Admin Extend Contest Duration
// @Description Add additional minutes to the active contest duration.
// @Tags Admin Contest
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param payload body extendContestRequest true "Extend contest payload"
// @Success 200 {object} contest.ContestState
// @Failure 400 {object} map[string]string
// @Router /api/v1/admin/contest/extend [post]
func (h *handler) adminExtendContest(c *gin.Context) {
	var req extendContestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.contest.Extend(c.Request.Context(), req.Minutes); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.recordAudit(c, audit.ActionContestExtend, audit.TargetContest, "", audit.StatusSuccess, map[string]interface{}{
		"addedMinutes": req.Minutes,
	})
	c.JSON(http.StatusOK, h.contest.GetState())
}

// @Summary Admin Freeze Contest Scoreboard
// @Description Manually freeze the leaderboard standings at the current moment.
// @Tags Admin Contest
// @Produce json
// @Security BearerAuth
// @Success 200 {object} contest.ContestState
// @Failure 500 {object} map[string]string
// @Router /api/v1/admin/contest/freeze [post]
func (h *handler) adminFreezeContest(c *gin.Context) {
	if err := h.contest.Freeze(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.recordAudit(c, audit.ActionContestFreeze, audit.TargetContest, "", audit.StatusSuccess, nil)
	c.JSON(http.StatusOK, h.contest.GetState())
}

// @Summary Admin Unfreeze Contest Scoreboard
// @Description Manually unfreeze the leaderboard standings to reveal live scores.
// @Tags Admin Contest
// @Produce json
// @Security BearerAuth
// @Success 200 {object} contest.ContestState
// @Failure 500 {object} map[string]string
// @Router /api/v1/admin/contest/unfreeze [post]
func (h *handler) adminUnfreezeContest(c *gin.Context) {
	if err := h.contest.Unfreeze(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.recordAudit(c, audit.ActionContestUnfreeze, audit.TargetContest, "", audit.StatusSuccess, nil)
	c.JSON(http.StatusOK, h.contest.GetState())
}

// @Summary Admin Reset Contest
// @Description Reset contest lifecycle back to NOT_STARTED.
// @Tags Admin Contest
// @Produce json
// @Security BearerAuth
// @Success 200 {object} contest.ContestState
// @Failure 500 {object} map[string]string
// @Router /api/v1/admin/contest/reset [post]
func (h *handler) adminResetContest(c *gin.Context) {
	if err := h.contest.Reset(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.recordAudit(c, audit.ActionContestReset, audit.TargetContest, "", audit.StatusSuccess, nil)
	c.JSON(http.StatusOK, h.contest.GetState())
}

// @Summary Admin End Contest
// @Description Immediately terminate the contest and set status to ENDED.
// @Tags Admin Contest
// @Produce json
// @Security BearerAuth
// @Success 200 {object} contest.ContestState
// @Failure 500 {object} map[string]string
// @Router /api/v1/admin/contest/end [post]
func (h *handler) adminEndContest(c *gin.Context) {
	if err := h.contest.End(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.recordAudit(c, audit.ActionContestEnd, audit.TargetContest, "", audit.StatusSuccess, nil)
	c.JSON(http.StatusOK, h.contest.GetState())
}

type updateContestSettingsRequest struct {
	Title                  string  `json:"title"`
	DurationMinutes        int     `json:"durationMinutes"`
	FreezeMinutes          int     `json:"freezeMinutes"`
	RequireFullscreen      *bool   `json:"requireFullscreen"`
	MinClientVersion       *string `json:"minClientVersion"`
	EnforceBinaryHash      *bool   `json:"enforceBinaryHash"`
	AuthorizedBinaryHashes *string `json:"authorizedBinaryHashes"`
}

// @Summary Admin Update Contest Settings
// @Description Update contest title, duration, and scoreboard freeze window.
// @Tags Admin Contest
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param payload body updateContestSettingsRequest true "Contest settings payload"
// @Success 200 {object} contest.ContestState
// @Failure 500 {object} map[string]string
// @Router /api/v1/admin/contest/settings [put]
func (h *handler) adminUpdateContestSettings(c *gin.Context) {
	var req updateContestSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.contest.UpdateSettings(
		c.Request.Context(),
		req.Title,
		req.DurationMinutes,
		req.FreezeMinutes,
		req.RequireFullscreen,
		req.MinClientVersion,
		req.EnforceBinaryHash,
		req.AuthorizedBinaryHashes,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if h.agentSettings != nil {
		_ = h.agentSettings.Reload(c.Request.Context())
	}
	h.recordAudit(c, audit.ActionContestSettingsUpdate, audit.TargetContest, "", audit.StatusSuccess, map[string]interface{}{
		"title":           req.Title,
		"durationMinutes": req.DurationMinutes,
		"freezeMinutes":   req.FreezeMinutes,
	})
	c.JSON(http.StatusOK, h.contest.GetState())
}
