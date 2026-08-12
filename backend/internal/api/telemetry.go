package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

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

	if h.proctorGate == nil {
		c.JSON(http.StatusOK, gin.H{"allowed": true, "exempt": true})
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
