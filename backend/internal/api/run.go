package api

import (
	"errors"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
)

const (
	maxRunCodeLength  = 100_000
	maxRunStdinLength = 1_000_000
)

var (
	activeRunsMu   sync.Mutex
	activeRunUsers = make(map[string]bool)
)

func tryAcquireUserRun(userID string) bool {
	activeRunsMu.Lock()
	defer activeRunsMu.Unlock()

	if activeRunUsers[userID] {
		return false
	}
	activeRunUsers[userID] = true
	return true
}

func releaseUserRun(userID string) {
	activeRunsMu.Lock()
	defer activeRunsMu.Unlock()

	delete(activeRunUsers, userID)
}

type runCodeRequest struct {
	Language string `json:"language" binding:"required"`
	Code     string `json:"code" binding:"required"`
	Stdin    string `json:"stdin"`
}

// @Summary Execute Code
// @Description Execute code against sample test cases or custom stdin in an isolated sandbox.
// @Tags Runner
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body runCodeRequest true "Code execution request"
// @Success 200 {object} runner.Result
// @Failure 400 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 409 {object} map[string]string
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

	u := currentUser(c)
	if !tryAcquireUserRun(u.ID) {
		c.JSON(http.StatusConflict, gin.H{"error": "You already have an active code run in progress. Please wait for it to complete."})
		return
	}
	defer releaseUserRun(u.ID)

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
