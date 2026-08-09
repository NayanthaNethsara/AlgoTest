package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/telemetry"
)

// @Summary Web Portal Ping
// @Description Record that a contestant is using the browser fallback. Carries no signals and never affects agent liveness.
// @Tags Telemetry
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body telemetry.WebPingRequest true "Web ping request"
// @Success 202 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/telemetry/ping [post]
func (h *handler) pingWebTelemetry(c *gin.Context) {
	u := currentUser(c)

	var req telemetry.WebPingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid telemetry payload"})
		return
	}

	row := telemetry.WebRow{
		UserID:     u.ID,
		IPAddress:  c.ClientIP(),
		UserAgent:  c.GetHeader("User-Agent"),
		TabVisible: req.TabVisible,
	}

	if h.telemetryBatcher != nil {
		h.telemetryBatcher.EnqueueWeb(row)
	} else if err := h.telemetry.UpsertWeb(c.Request.Context(), row); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record web ping"})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{"status": "accepted"})
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
// @Description Report the contestant's own agent liveness so the portal can warn them while they still have time to fix it.
// @Tags Telemetry
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Router /api/v1/telemetry/self [get]
func (h *handler) getProctorSelfStatus(c *gin.Context) {
	u := currentUser(c)
	if h.proctorGate == nil {
		c.JSON(http.StatusOK, gin.H{"allowed": true, "exempt": true})
		return
	}

	decision, loopbackPort, err := h.proctorGate.Status(c.Request.Context(), u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check proctor status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"allowed":            decision.Allowed,
		"code":               decision.Code,
		"exempt":             decision.Exempt,
		"active_client":      decision.ActiveClient,
		"last_ping_at":       decision.LastSeenAt,
		"seconds_since_ping": decision.SecondsSincePing,
		"remedy":             decision.Remedy,
		"loopback_port":      loopbackPort,
	})
}
