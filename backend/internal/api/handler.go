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
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/session"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

type handler struct {
	cfg      config.Config
	judge    *judge.Judge
	runner   *runner.Runner
	db       *pgxpool.Pool
	users    *user.Repository
	sessions *session.Repository
}

func (h *handler) health(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	if err := h.db.Ping(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "degraded", "database": "down"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "database": "up"})
}

type createSubmissionRequest struct {
	Language string `json:"language" binding:"required"`
	Code     string `json:"code" binding:"required"`
}

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

func (h *handler) getSubmission(c *gin.Context) {
	result, ok := h.judge.Result(c.Param("id"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "submission not found"})
		return
	}
	c.JSON(http.StatusOK, result)
}
