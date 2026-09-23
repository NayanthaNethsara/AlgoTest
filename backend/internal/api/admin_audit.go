package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/labyrithm/backend/internal/audit"
)

// @Summary List Audit Logs
// @Description Fetch paginated administrative and security audit events.
// @Tags Admin
// @Produce json
// @Security BearerAuth
// @Param limit query int false "Max logs to return (default 50, max 200)"
// @Param offset query int false "Offset for pagination"
// @Param action query string false "Filter by action type"
// @Param status query string false "Filter by status (success, failure, locked, blocked)"
// @Param actorUsername query string false "Filter by actor username"
// @Param targetType query string false "Filter by target resource type"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Router /api/v1/admin/audit-logs [get]
func (h *handler) listAuditLogs(c *gin.Context) {
	if h.audit == nil {
		c.JSON(http.StatusOK, gin.H{"logs": []audit.LogEntry{}, "total": 0})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	filter := audit.FilterOptions{
		Action:        c.Query("action"),
		Status:        c.Query("status"),
		ActorUsername: c.Query("actorUsername"),
		TargetType:    c.Query("targetType"),
		Limit:         limit,
		Offset:        offset,
	}

	logs, total, err := h.audit.List(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query audit logs: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":   logs,
		"total":  total,
		"limit":  filter.Limit,
		"offset": filter.Offset,
	})
}
