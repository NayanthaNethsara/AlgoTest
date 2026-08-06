package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/telemetry"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

// @Summary Telemetry Ping
// @Description Submit lightweight background telemetry heartbeat from competitor desktop app.
// @Tags Telemetry
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body telemetry.PingRequest true "Telemetry ping request"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/telemetry/ping [post]
func (h *handler) pingTelemetry(c *gin.Context) {
	if !h.cfg.EnableTelemetry {
		c.JSON(http.StatusOK, gin.H{"status": "disabled"})
		return
	}

	userVal, exists := c.Get(contextUserKey)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	currentUser := userVal.(user.User)

	var req telemetry.PingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid telemetry payload"})
		return
	}

	clientIPAddress := c.ClientIP()
	if err := h.telemetry.UpsertHeartbeat(c.Request.Context(), currentUser.ID, currentUser.TeamID, req, clientIPAddress); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record telemetry ping"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "acknowledged"})
}

// @Summary List Telemetry Monitoring Data
// @Description Fetch live telemetry and online status for all competitor accounts.
// @Tags Admin Telemetry
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string][]telemetry.Heartbeat
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/admin/telemetry [get]
func (h *handler) listAdminTelemetry(c *gin.Context) {
	heartbeats, err := h.telemetry.ListAllHeartbeats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"telemetry": heartbeats})
}

// @Summary Self Proctor Status
// @Description Check current user proctor agent liveness status and exemption flag.
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

	status, err := h.proctorGate.Check(c.Request.Context(), u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check proctor status"})
		return
	}

	c.JSON(http.StatusOK, status)
}
