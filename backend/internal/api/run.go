package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
)

const (
	maxRunCodeLength  = 100_000
	maxRunStdinLength = 1_000_000
)

type runCodeRequest struct {
	Language string `json:"language" binding:"required"`
	Code     string `json:"code" binding:"required"`
	Stdin    string `json:"stdin"`
}

// runCode executes submitted code against the caller-supplied stdin inside a
// sandboxed container and returns immediately with stdout/stderr/exit code.
// Unlike createSubmission, this never touches hidden test cases.
func (h *handler) runCode(c *gin.Context) {
	var req runCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Code) > maxRunCodeLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code too long"})
		return
	}
	if len(req.Stdin) > maxRunStdinLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": "stdin too long"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), h.runner.OverallTimeout())
	defer cancel()

	result, err := h.runner.Run(ctx, runner.Request{
		Language: req.Language,
		Code:     req.Code,
		Stdin:    req.Stdin,
	})
	if err != nil {
		if errors.Is(err, runner.ErrUnsupportedLanguage) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, runner.ErrBusy) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "server busy, please retry"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "execution failed"})
		return
	}

	c.JSON(http.StatusOK, result)
}
