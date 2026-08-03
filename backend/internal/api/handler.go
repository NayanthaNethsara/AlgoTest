package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
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
	ProblemID string `json:"problem_id" binding:"required"`
	Language  string `json:"language" binding:"required"`
	Code      string `json:"code" binding:"required"`
}

var supportedLanguages = map[string]bool{
	"cpp":    true,
	"c":      true,
	"java":   true,
	"python": true,
	"py":     true,
	"go":     true,
	"rs":     true,
	"js":     true,
	"ts":     true,
}

// @Summary Submit Code
// @Description Queue code submission for official contest judging.
// @Tags Submissions
// @Accept json
// @Produce json
// @Param submission body createSubmissionRequest true "Submission payload"
// @Success 202 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/submissions [post]
func (h *handler) createSubmission(c *gin.Context) {
	var req createSubmissionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1. Resolve & Validate Problem ID (accepts UUID or slug)
	problemID := req.ProblemID
	if _, err := uuid.Parse(problemID); err != nil {
		p, err := h.problems.GetPublishedBySlug(c.Request.Context(), problemID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid problem_id format or problem not found"})
			return
		}
		problemID = p.ID
	}

	// 2. Validate language whitelist
	langLower := strings.ToLower(strings.TrimSpace(req.Language))
	if !supportedLanguages[langLower] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported language"})
		return
	}

	// 3. Validate code size & non-empty content
	trimmedCode := strings.TrimSpace(req.Code)
	if trimmedCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code cannot be empty"})
		return
	}
	if len(req.Code) > 100_000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code size exceeds maximum limit (100KB)"})
		return
	}

	u := currentUser(c)
	teamID := u.ID
	if u.TeamID != nil && *u.TeamID != "" {
		teamID = *u.TeamID
	}

	submission := judge.Submission{
		ID:        uuid.NewString(),
		UserID:    u.ID,
		TeamID:    teamID,
		ProblemID: problemID,
		Language:  langLower,
		Code:      req.Code,
	}

	created, err := h.judge.Submit(c.Request.Context(), submission)
	if err != nil {
		if errors.Is(err, judge.ErrActiveSubmissionExists) {
			c.JSON(http.StatusConflict, gin.H{"error": "Your team already has an active submission queued or running for this problem. Please wait for it to complete."})
			return
		}
		if errors.Is(err, judge.ErrProblemNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Problem not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create submission: " + err.Error()})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"id":             created.ID,
		"status":         created.State,
		"queue_position": created.QueuePosition,
	})
}

// @Summary Get Submission Result
// @Description Fetch evaluation verdict and test results by submission ID.
// @Tags Submissions
// @Produce json
// @Param id path string true "Submission ID"
// @Success 200 {object} judge.Result
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/submissions/{id} [get]
func (h *handler) getSubmission(c *gin.Context) {
	u := currentUser(c)
	result, ok, err := h.judge.Result(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch submission"})
		return
	}
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "submission not found"})
		return
	}

	// Enforce ownership access control: Admins can view any, competitors can only view their own user/team submissions
	if u.Role != user.RoleAdmin {
		isOwnerUser := result.UserID == u.ID
		isOwnerTeam := u.TeamID != nil && *u.TeamID != "" && result.TeamID == *u.TeamID
		if !isOwnerUser && !isOwnerTeam {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied to this submission"})
			return
		}
	}

	c.JSON(http.StatusOK, result)
}

// @Summary Stream Submission Status (SSE)
// @Description Server-Sent Events stream for real-time submission progress and result pushes.
// @Tags Submissions
// @Produce text/event-stream
// @Router /api/v1/submissions/stream [get]
func (h *handler) streamSubmissions(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	u := currentUser(c)
	ch, unsubscribe := h.judge.Broadcaster().Subscribe(u.ID)
	defer unsubscribe()

	c.SSEvent("connected", gin.H{"status": "connected"})
	c.Writer.Flush()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case <-ticker.C:
			c.SSEvent("ping", gin.H{"time": time.Now().Unix()})
			c.Writer.Flush()
		case res, ok := <-ch:
			if !ok {
				return
			}
			c.SSEvent("submission", res)
			c.Writer.Flush()
		}
	}
}

func (h *handler) listAdminSubmissions(c *gin.Context) {
	statusFilter := c.Query("status")
	problemID := c.Query("problem_id")
	teamID := c.Query("team_id")
	limit := 50
	offset := 0

	submissions, total, err := h.judge.Repo().ListAdminSubmissions(c.Request.Context(), statusFilter, problemID, teamID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list submissions: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"submissions": submissions,
		"total":       total,
	})
}

func (h *handler) rejudgeSubmission(c *gin.Context) {
	id := c.Param("id")
	if err := h.judge.Repo().RejudgeSubmission(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to rejudge submission: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "submission re-queued for judging"})
}

func (h *handler) cancelSubmission(c *gin.Context) {
	id := c.Param("id")
	if err := h.judge.Repo().CancelSubmission(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to cancel submission: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "submission cancelled"})
}

func (h *handler) unstickTeamSubmissions(c *gin.Context) {
	teamID := c.Param("id")
	if err := h.judge.Repo().UnstickTeamSubmissions(c.Request.Context(), teamID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to unstick team submissions: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "active submission locks cleared for team"})
}



