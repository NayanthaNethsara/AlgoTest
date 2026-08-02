package api

import (
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

// @Summary Run Code in Sandbox
// @Description Execute untrusted code in isolate sandbox against user-supplied stdin input.
// @Tags Sandbox
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body runCodeRequest true "Code execution request"
// @Success 200 {object} runner.Result
// @Failure 400 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /api/v1/run [post]
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

	result, err := h.runner.Run(c.Request.Context(), runner.Request{
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
