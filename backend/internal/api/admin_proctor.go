package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type updateExemptionRequest struct {
	Exempt bool `json:"exempt"`
}

type postReviewRequest struct {
	UserID string `json:"userId" binding:"required"`
	Status string `json:"status" binding:"required"` // CLEARED, FLAGGED, ESCALATED
	Notes  string `json:"notes"`
}

// @Summary List Competitor Risk Rollups
// @Description Fetch risk scores, severities, and finding counts for all competitors.
// @Tags Admin Proctoring
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/admin/proctor/risk [get]
func (h *handler) listAdminProctorRisk(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT u.id, u.username, u.display_name, u.proctor_exempt,
		       COALESCE(r.score, 0) as score,
		       COALESCE(r.severity, 'LOW') as severity,
		       COALESCE(r.finding_count, 0) as finding_count,
		       h.last_ping_at
		FROM users u
		LEFT JOIN proctor_risk r ON u.id = r.user_id
		LEFT JOIN telemetry_heartbeats h ON u.id = h.user_id
		WHERE u.role = 'COMPETITOR'
		ORDER BY r.score DESC NULLS LAST, u.username ASC;
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type competitorRiskItem struct {
		UserID        string   `json:"userId"`
		Username      string   `json:"username"`
		DisplayName   string   `json:"displayName"`
		ProctorExempt bool     `json:"proctorExempt"`
		Score         int      `json:"score"`
		Severity      string   `json:"severity"`
		FindingCount  int      `json:"findingCount"`
		LastPingAt    *string  `json:"lastPingAt"`
	}

	var items []competitorRiskItem
	for rows.Next() {
		var item competitorRiskItem
		var pingTime *string
		if err := rows.Scan(&item.UserID, &item.Username, &item.DisplayName, &item.ProctorExempt, &item.Score, &item.Severity, &item.FindingCount, &pingTime); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		item.LastPingAt = pingTime
		items = append(items, item)
	}

	c.JSON(http.StatusOK, gin.H{"risk": items})
}

// @Summary Get User Findings
// @Description Fetch evidence findings for a specific competitor.
// @Tags Admin Proctoring
// @Produce json
// @Security BearerAuth
// @Param userId path string true "User ID"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/admin/proctor/findings/{userId} [get]
func (h *handler) getAdminProctorFindings(c *gin.Context) {
	targetUserID := c.Param("userId")

	rows, err := h.db.Query(c.Request.Context(), `
		SELECT f.id, f.rule_id, r.title, r.category, f.weight, f.evidence, f.created_at
		FROM proctor_findings f
		JOIN proctor_rules r ON f.rule_id = r.id
		WHERE f.user_id = $1
		ORDER BY f.created_at DESC;
	`, targetUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type findingItem struct {
		ID        string      `json:"id"`
		RuleID    string      `json:"ruleId"`
		Title     string      `json:"title"`
		Category  string      `json:"category"`
		Weight    int         `json:"weight"`
		Evidence  interface{} `json:"evidence"`
		CreatedAt string      `json:"createdAt"`
	}

	var items []findingItem
	for rows.Next() {
		var item findingItem
		if err := rows.Scan(&item.ID, &item.RuleID, &item.Title, &item.Category, &item.Weight, &item.Evidence, &item.CreatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		items = append(items, item)
	}

	c.JSON(http.StatusOK, gin.H{"findings": items})
}

// @Summary Update User Proctor Exemption
// @Description Grant or revoke proctoring exemption for a user.
// @Tags Admin Proctoring
// @Security BearerAuth
// @Param id path string true "User ID"
// @Param request body updateExemptionRequest true "Exemption payload"
// @Success 200 {object} map[string]string
// @Router /api/v1/admin/users/{id}/exemption [patch]
func (h *handler) updateUserProctorExemption(c *gin.Context) {
	targetID := c.Param("id")
	var req updateExemptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	_, err := h.db.Exec(c.Request.Context(), `
		UPDATE users SET proctor_exempt = $1 WHERE id = $2;
	`, req.Exempt, targetID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}
