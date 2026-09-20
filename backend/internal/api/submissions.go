package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"
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
	"rust":       "rust",
	"rs":         "rust",
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
	if u.TeamID == nil || *u.TeamID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "You must be assigned to a team to make submissions."})
		return
	}
	teamID := *u.TeamID

	if h.proctorEvaluator != nil {
		if shouldFlag, evidence := evaluateSubmissionTelemetry(req.Code, req); shouldFlag {
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
			h.respondError(c, http.StatusTooManyRequests, "Submission cooldown active. Please wait a few seconds before submitting again.", err)
			return
		}
		if errors.Is(err, judge.ErrActiveSubmissionExists) {
			h.respondError(c, http.StatusConflict, "Your team already has an active submission queued or running for this problem. Please wait for it to complete.", err)
			return
		}
		if errors.Is(err, judge.ErrProblemNotFound) {
			h.respondError(c, http.StatusNotFound, "Problem not found", err)
			return
		}
		if errors.Is(err, judge.ErrNoTestCases) {
			h.respondError(c, http.StatusUnprocessableEntity, "This problem has no test cases configured yet. Please notify an organizer -- your submission was not recorded.", err)
			return
		}
		h.respondError(c, http.StatusInternalServerError, "Failed to create submission: "+err.Error(), err)
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"id":             created.ID,
		"status":         created.State,
		"queue_position": created.QueuePosition,
		"max_score":      created.MaxScore,
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
	if ch == nil {
		c.Header("Content-Type", "application/json")
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many submission streams"})
		return
	}
	defer unsubscribe()
	controller := http.NewResponseController(c.Writer)
	defer controller.SetWriteDeadline(time.Time{})
	_ = controller.SetWriteDeadline(time.Now().Add(10 * time.Second))

	c.SSEvent("connected", gin.H{"status": "connected"})
	if err := controller.Flush(); err != nil {
		return
	}
	_ = controller.SetWriteDeadline(time.Time{})

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	token := h.extractSessionToken(c)
	lastAuthCheck := time.Now()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case <-ticker.C:
			if time.Since(lastAuthCheck) >= time.Minute {
				ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
				s, sessionErr := h.sessions.Get(ctx, token)
				current, userErr := h.users.GetByID(ctx, u.ID)
				cancel()
				if sessionErr != nil || userErr != nil || s.UserID != u.ID || current.IsSuspended {
					return
				}
				lastAuthCheck = time.Now()
			}
			_ = controller.SetWriteDeadline(time.Now().Add(10 * time.Second))
			c.SSEvent("ping", gin.H{"time": time.Now().Unix()})
			if err := controller.Flush(); err != nil {
				return
			}
			_ = controller.SetWriteDeadline(time.Time{})
		case res, ok := <-ch:
			if !ok {
				return
			}
			_ = controller.SetWriteDeadline(time.Now().Add(10 * time.Second))
			c.SSEvent("submission", res)
			if err := controller.Flush(); err != nil {
				return
			}
			_ = controller.SetWriteDeadline(time.Time{})
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
	if problemID != "" {
		if _, err := uuid.Parse(problemID); err != nil {
			if p, err := h.problems.GetPublishedBySlug(c.Request.Context(), problemID); err == nil {
				problemID = p.ID
			}
		}
	}
	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			if parsed > 1000 {
				parsed = 1000
			}
			limit = parsed
		}
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	teamID := ""
	if u.TeamID != nil {
		teamID = *u.TeamID
	}

	includeCode := c.Query("include_code") == "true" || problemID != ""

	submissions, total, err := h.judge.Repo().ListOwnSubmissions(c.Request.Context(), statusFilter, problemID, u.ID, teamID, limit, offset, includeCode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list submissions: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"submissions": submissions,
		"total":       total,
		"limit":       limit,
		"offset":      offset,
	})
}

func evaluateSubmissionTelemetry(code string, req createSubmissionRequest) (bool, map[string]any) {
	codeLen := len(code)
	if codeLen <= 150 {
		return false, nil
	}

	pasted := 0
	if req.PastedChars != nil {
		pasted = *req.PastedChars
	}
	typed := 0
	if req.TypedCount != nil {
		typed = *req.TypedCount
	}
	pasteCount := 0
	if req.PasteCount != nil {
		pasteCount = *req.PasteCount
	}
	maxPaste := 0
	if req.MaxPasteSize != nil {
		maxPaste = *req.MaxPasteSize
	}

	isUnmonitored := req.PastedChars == nil && req.TypedCount == nil
	effectivePasted := pasted
	if isUnmonitored || (pasted == 0 && typed == 0) {
		effectivePasted = codeLen
	} else {
		unaccounted := codeLen - (typed + pasted)
		if unaccounted > 100 {
			effectivePasted += unaccounted
		}
	}

	pastedRatio := float64(effectivePasted) / float64(codeLen)
	if effectivePasted > 250 && pastedRatio > 0.75 && typed < 25 {
		evidence := map[string]any{
			"code_length":      codeLen,
			"pasted_chars":     pasted,
			"typed_count":      typed,
			"paste_count":      pasteCount,
			"max_paste_size":   maxPaste,
			"pasted_ratio":     pastedRatio,
			"effective_pasted": effectivePasted,
			"unmonitored_api":  isUnmonitored,
		}
		return true, evidence
	}

	return false, nil
}
