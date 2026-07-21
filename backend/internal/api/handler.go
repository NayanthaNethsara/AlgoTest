package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
)

type handler struct {
	judge *judge.Judge
}

func (h *handler) health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
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
