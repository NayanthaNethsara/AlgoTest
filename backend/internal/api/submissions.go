package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/contest"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

type createSubmissionRequest struct {
	ProblemID    string `json:"problem_id" binding:"required"`
	Language     string `json:"language" binding:"required"`
	Code         string `json:"code" binding:"required"`
	TypedCount   *int   `json:"typed_count,omitempty"`
	PasteCount   *int   `json:"paste_count,omitempty"`
	PastedChars  *int   `json:"pasted_chars,omitempty"`
	MaxPasteSize *int   `json:"max_paste_size,omitempty"`
}

var supportedLanguages = map[string]string{
	"c":          "c",
	"cpp":        "cpp",
	"c++":        "cpp",
	"py":         "py",
	"python":     "py",
	"python3":    "py",
	"java":       "java",
	"js":         "js",
	"javascript": "js",
	"node":       "js",
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

	u := currentUser(c)

	if h.contest != nil && u.Role != user.RoleAdmin {
		cState := h.contest.GetState()
		switch cState.Status {
		case contest.StatusNotStarted:
			c.JSON(http.StatusForbidden, gin.H{
				"error": "contest has not started yet",
				"code":  "CONTEST_NOT_STARTED",
			})
			return
		case contest.StatusPaused:
			c.JSON(http.StatusForbidden, gin.H{
				"error": "contest is currently paused by administrators",
				"code":  "CONTEST_PAUSED",
			})
			return
		case contest.StatusEnded:
			c.JSON(http.StatusForbidden, gin.H{
				"error": "contest has ended; submissions are closed",
				"code":  "CONTEST_ENDED",
			})
			return
		}
	}

	problemID := req.ProblemID
	if _, err := uuid.Parse(problemID); err != nil {
		p, err := h.problems.GetPublishedBySlug(c.Request.Context(), problemID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid problem_id format or problem not found"})
			return
		}
		problemID = p.ID
	}

	rawLang := strings.ToLower(strings.TrimSpace(req.Language))
	normalizedLang, supported := supportedLanguages[rawLang]
	if !supported {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported language"})
		return
	}

	trimmedCode := strings.TrimSpace(req.Code)
	if trimmedCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code cannot be empty"})
		return
	}
	if len(req.Code) > 100_000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code size exceeds maximum limit (100KB)"})
		return
	}

	if h.proctorGate != nil && !h.cfg.ShouldBypassProctor() {
		clientIP, ipTrusted := portalClientIP(c)
		decision, err := h.proctorGate.Check(c.Request.Context(), agent.CheckRequest{
			UserID:          u.ID,
			ClaimsDesktop:   portalClaimsDesktop(c),
			ClientIP:        clientIP,
			ClientIPTrusted: ipTrusted,
			AttestNonce:     portalAttestNonce(c),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to evaluate proctor liveness"})
			return
		}
		if !decision.Allowed {
			c.JSON(http.StatusLocked, gin.H{
				"error":              decision.Remedy,
				"code":               decision.Code,
				"last_ping_at":       decision.LastSeenAt,
				"seconds_since_ping": decision.SecondsSincePing,
				"access_mode":        decision.AccessMode,
				"allowed_modes":      decision.AllowedModes,
			})
			return
		}
	}
	teamID := u.ID
	if u.TeamID != nil && *u.TeamID != "" {
		teamID = *u.TeamID
	}

	if h.proctorEvaluator != nil && req.PastedChars != nil && req.TypedCount != nil {
		pasted := *req.PastedChars
		typed := *req.TypedCount
		codeLen := len(req.Code)
		if pasted > 300 && codeLen > 0 && float64(pasted)/float64(codeLen) > 0.80 && typed < 15 {
			maxPaste := 0
			if req.MaxPasteSize != nil {
				maxPaste = *req.MaxPasteSize
			}
			pasteCount := 0
			if req.PasteCount != nil {
				pasteCount = *req.PasteCount
			}
			evidence := map[string]any{
				"code_length":    codeLen,
				"pasted_chars":   pasted,
				"typed_count":    typed,
				"paste_count":    pasteCount,
				"max_paste_size": maxPaste,
				"pasted_ratio":   float64(pasted) / float64(codeLen),
			}
			_ = h.proctorEvaluator.RecordEvent(c.Request.Context(), u.ID, "ai.code.paste_burst", 20, evidence)
		}
	}

	submission := judge.Submission{
		ID:        uuid.NewString(),
		UserID:    u.ID,
		TeamID:    teamID,
		ProblemID: problemID,
		Language:  normalizedLang,
		Code:      req.Code,
	}

	created, err := h.judge.Submit(c.Request.Context(), submission)
	if err != nil {
		if errors.Is(err, judge.ErrSubmissionRateLimited) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Submission cooldown active. Please wait a few seconds before submitting again."})
			return
		}
		if errors.Is(err, judge.ErrActiveSubmissionExists) {
			c.JSON(http.StatusConflict, gin.H{"error": "Your team already has an active submission queued or running for this problem. Please wait for it to complete."})
			return
		}
		if errors.Is(err, judge.ErrProblemNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Problem not found"})
			return
		}
		if errors.Is(err, judge.ErrNoTestCases) {
			h.log.Error("submission rejected: problem has no test cases",
				"problem_id", problemID, "user_id", u.ID)
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"error": "This problem has no test cases configured yet. Please notify an organizer -- your submission was not recorded.",
				"code":  "PROBLEM_NOT_GRADABLE",
			})
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

// @Summary List User Submissions
// @Description List submissions made by current user or team.
// @Tags Submissions
// @Produce json
// @Router /api/v1/submissions [get]
func (h *handler) listUserSubmissions(c *gin.Context) {
	val, exists := c.Get(contextUserKey)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	u := val.(user.User)

	statusFilter := c.Query("status")
	problemID := c.Query("problem_id")
	limit := 50
	offset := 0

	teamID := ""
	if u.TeamID != nil {
		teamID = *u.TeamID
	}

	submissions, total, err := h.judge.Repo().ListOwnSubmissions(c.Request.Context(), statusFilter, problemID, u.ID, teamID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list submissions: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"submissions": submissions,
		"total":       total,
	})
}
