package api

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/session"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

type handler struct {
	cfg      config.Config
	judge    *judge.Judge
	runner   *runner.Runner
	db       *pgxpool.Pool
	users    *user.Repository
	sessions *session.Repository
	problems *problem.Repository
	teams    *team.Repository
}

// @Summary System Health Check
// @Description Check backend database connection and API service health status.
// @Tags Health
// @Produce json
// @Success 200 {object} map[string]string
// @Failure 533 {object} map[string]string
// @Router /healthz [get]
func (h *handler) health(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	if err := h.db.Ping(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "degraded", "database": "down"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "database": "up"})
}

// @Summary List Teams
// @Description Fetch all teams and their assigned member accounts.
// @Tags Teams
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string][]team.Team
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/teams [get]
func (h *handler) listTeams(c *gin.Context) {
	teams, err := h.teams.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list teams"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"teams": teams})
}

type createSubmissionRequest struct {
	Language string `json:"language" binding:"required"`
	Code     string `json:"code" binding:"required"`
}

// @Summary Submit Code
// @Description Queue code submission for official contest judging.
// @Tags Submissions
// @Accept json
// @Produce json
// @Param submission body createSubmissionRequest true "Submission payload"
// @Success 202 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /api/v1/submissions [post]
func (h *handler) createSubmission(c *gin.Context) {
	var req createSubmissionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	submission := judge.Submission{
		ID:       uuid.NewString(),
		Language: req.Language,
		Code:     req.Code,
	}
	if err := h.judge.Submit(submission); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{"id": submission.ID, "status": judge.StatusQueued})
}

// @Summary Get Submission Result
// @Description Fetch evaluation verdict and test results by submission ID.
// @Tags Submissions
// @Produce json
// @Param id path string true "Submission ID"
// @Success 200 {object} judge.Result
// @Failure 404 {object} map[string]string
// @Router /api/v1/submissions/{id} [get]
func (h *handler) getSubmission(c *gin.Context) {
	result, ok := h.judge.Result(c.Param("id"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "submission not found"})
		return
	}
	c.JSON(http.StatusOK, result)
}
