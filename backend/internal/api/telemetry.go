package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/telemetry"
)

// recordWebPresence notes that a portal is open for this contestant. It carries no
// signals and never touches agent liveness — the browser is a fallback UI, not a
// source of truth, which is what stops "open the portal" from being a way around
// proctoring.
//
// Best-effort by design: presence is context for a reviewer, and failing a
// contestant's status poll because a presence row could not be written would turn
// a bookkeeping problem into a submission problem.
func (h *handler) recordWebPresence(c *gin.Context, userID string) {
	// Only believed when a configured trusted proxy forwarded it; the portal's own
	// address recorded as the contestant's would be worse than no address at all.
	ip, trusted := portalClientIP(c)
	if !trusted {
		ip = ""
	}

	row := telemetry.WebRow{
		UserID:     userID,
		IPAddress:  ip,
		UserAgent:  c.GetHeader("User-Agent"),
		TabVisible: c.Query("tab_visible") != "false",
	}

	if h.telemetryBatcher != nil {
		h.telemetryBatcher.EnqueueWeb(row)
		return
	}
	if err := h.telemetry.UpsertWeb(c.Request.Context(), row); err != nil && h.log != nil {
		h.log.Warn("failed to record web presence", "user_id", userID, "error", err)
	}
}

// @Summary List Telemetry Monitoring Data
// @Description Fetch live agent telemetry and liveness for competitor accounts.
// @Tags Admin Telemetry
// @Produce json
// @Security BearerAuth
// @Param status query string false "Filter by ONLINE, STALE or OFFLINE"
// @Param q query string false "Match username or display name"
// @Param limit query int false "Page size (default 100, max 500)"
// @Param offset query int false "Page offset"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/admin/telemetry [get]
func (h *handler) listAdminTelemetry(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	offset, _ := strconv.Atoi(c.Query("offset"))

	heartbeats, total, err := h.telemetry.ListHeartbeats(c.Request.Context(), telemetry.ListFilter{
		Status: c.Query("status"),
		Query:  c.Query("q"),
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if heartbeats == nil {
		heartbeats = []telemetry.Heartbeat{}
	}

	c.JSON(http.StatusOK, gin.H{"telemetry": heartbeats, "total": total})
}

// @Summary Self Proctor Status
// @Description Report the contestant's own agent liveness so the portal can warn them while they still have time to fix it. Recording the caller's browser presence is a side effect of the poll.
// @Tags Telemetry
// @Produce json
// @Security BearerAuth
// @Param tab_visible query bool false "Whether the portal tab was foregrounded when polled"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Router /api/v1/telemetry/self [get]
func (h *handler) getProctorSelfStatus(c *gin.Context) {
	u := currentUser(c)

	// Presence rides on the status poll the portal already makes every tick. As a
	// separate endpoint it doubled the portal's request count to record something
	// the poll itself proves: the contestant has a portal open right now.
	h.recordWebPresence(c, u.ID)

	if h.proctorGate == nil || h.cfg.ShouldBypassProctor() {
		c.JSON(http.StatusOK, gin.H{
			"allowed":            true,
			"exempt":             true,
			"code":               "",
			"active_client":      agent.ClientBrowser,
			"access_mode":        agent.ModeWebOnly,
			"allowed_modes":      agent.AllAccessModes,
			"seconds_since_ping": 0,
			"remedy":             "",
			"loopback_port":      0,
		})
		return
	}

	decision, loopbackPort, err := h.proctorGate.Status(c.Request.Context(), u.ID, portalClaimsDesktop(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check proctor status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"allowed":            decision.Allowed,
		"code":               decision.Code,
		"exempt":             decision.Exempt,
		"active_client":      decision.ActiveClient,
		"access_mode":        decision.AccessMode,
		"allowed_modes":      decision.AllowedModes,
		"last_ping_at":       decision.LastSeenAt,
		"seconds_since_ping": decision.SecondsSincePing,
		"remedy":             decision.Remedy,
		"loopback_port":      loopbackPort,
	})
}

type browserEventRequest struct {
	EventType string         `json:"event_type" binding:"required"`
	Detail    string         `json:"detail"`
	Signals   map[string]any `json:"signals"`
}

// @Summary Record Browser Violation Telemetry Event
// @Description Ingest client-side browser proctoring violations (e.g. fullscreen exits, window blur, tab switch, devtools attempt).
// @Tags Telemetry
// @Accept json
// @Produce json
// @Security BearerAuth
// @Router /api/v1/telemetry/browser-event [post]
func (h *handler) recordBrowserEvent(c *gin.Context) {
	u := currentUser(c)

	var req browserEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload: event_type is required"})
		return
	}

	defaultWeight := 15
	switch req.EventType {
	case "web.fullscreen_exit":
		defaultWeight = 15
	case "web.window_blur", "web.tab_switch":
		defaultWeight = 20
	case "web.devtools_attempt":
		defaultWeight = 25
	case "web.lockout_exceeded":
		defaultWeight = 35
	}

	signals := req.Signals
	if signals == nil {
		signals = map[string]any{}
	}
	if req.Detail != "" {
		signals["detail"] = req.Detail
	}

	if h.proctorEvaluator != nil {
		if err := h.proctorEvaluator.RecordEvent(c.Request.Context(), u.ID, req.EventType, defaultWeight, signals); err != nil && h.log != nil {
			h.log.Warn("failed to record browser event finding", "user_id", u.ID, "rule", req.EventType, "error", err)
		}
	}

	if h.agents != nil {
		signalsBytes, _ := json.Marshal(signals)
		if err := h.agents.AppendEvent(c.Request.Context(), u.ID, "", "", req.EventType, "", 0, signalsBytes, time.Now()); err != nil && h.log != nil {
			h.log.Warn("failed to append telemetry event", "user_id", u.ID, "error", err)
		}
	}

	c.JSON(http.StatusOK, gin.H{"status": "recorded"})
}

// @Summary Voluntary Contest Leave
// @Description Contestant voluntarily leaves the competition session. This revokes active agent enrollment and locks submission access until re-admitted by an admin.
// @Tags Telemetry
// @Produce json
// @Security BearerAuth
// @Router /api/v1/telemetry/leave-contest [post]
func (h *handler) leaveContest(c *gin.Context) {
	u := currentUser(c)

	if h.agents != nil {
		agents, err := h.agents.ListAgents(c.Request.Context())
		if err == nil {
			for _, a := range agents {
				if a.UserID == u.ID && a.RevokedAt == nil {
					_ = h.agents.Revoke(c.Request.Context(), a.ID, "Contestant voluntarily exited competition")
				}
			}
		}
	}

	signals := map[string]any{
		"action":   "voluntary_exit",
		"user_id":  u.ID,
		"username": u.Username,
	}

	if h.proctorEvaluator != nil {
		_ = h.proctorEvaluator.RecordEvent(c.Request.Context(), u.ID, "web.lockout_exceeded", 35, signals)
	}

	if h.agents != nil {
		signalsBytes, _ := json.Marshal(signals)
		_ = h.agents.AppendEvent(c.Request.Context(), u.ID, "", "", "web.lockout_exceeded", "", 0, signalsBytes, time.Now())
	}

	c.JSON(http.StatusOK, gin.H{"status": "left", "locked": true})
}

// @Summary Admin Re-admit Contestant
// @Description Administrator clears the exit lockout and allows contestant to re-enroll or re-enter competition.
// @Tags Admin Proctoring
// @Produce json
// @Security BearerAuth
// @Param id path string true "User ID"
// @Router /api/v1/admin/proctor/users/{id}/readmit [post]
func (h *handler) readmitContestant(c *gin.Context) {
	targetUserID := c.Param("id")

	if h.db != nil {
		_, _ = h.db.Exec(c.Request.Context(), `
			DELETE FROM proctor_findings WHERE user_id = $1 AND rule_id IN ('web.lockout_exceeded', 'web.fullscreen_exit');
		`, targetUserID)
	}

	if h.proctorEvaluator != nil {
		_ = h.proctorEvaluator.RecordEvent(c.Request.Context(), targetUserID, "tel.web_only_grant", 0, map[string]any{
			"action": "admin_readmitted",
		})
	}

	c.JSON(http.StatusOK, gin.H{"status": "readmitted"})
}
