package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
)

type updateExemptionRequest struct {
	Exempt     bool   `json:"exempt"`
	Reason     string `json:"reason"`
	HoursValid int    `json:"hoursValid"`
}

// updateAccessRequest carries the whole grant, not a delta. Two independent flags
// arriving one at a time would make "allow the browser" and "revoke no-agent" race
// each other when two organizers work the same row.
type updateAccessRequest struct {
	WebWithAgent bool   `json:"webWithAgent"`
	WebOnly      bool   `json:"webOnly"`
	Reason       string `json:"reason"`
	// HoursValid of 0 means for the rest of the contest. A browser grant usually
	// answers a machine that will still be broken tomorrow, so unlike an exemption
	// it is not forced to expire within the day.
	HoursValid int `json:"hoursValid"`
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
		       h.last_ping_at,
		       u.proctor_allow_web_with_agent AND (u.proctor_access_until IS NULL OR u.proctor_access_until > now()),
		       u.proctor_allow_web_only AND (u.proctor_access_until IS NULL OR u.proctor_access_until > now())
		FROM users u
		LEFT JOIN proctor_risk r ON u.id = r.user_id
		LEFT JOIN telemetry_heartbeats h ON u.id = h.user_id
		WHERE u.role = 'competitor'
		ORDER BY r.score DESC NULLS LAST, u.username ASC;
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type competitorRiskItem struct {
		UserID        string  `json:"userId"`
		Username      string  `json:"username"`
		DisplayName   string  `json:"displayName"`
		ProctorExempt bool    `json:"proctorExempt"`
		Score         int     `json:"score"`
		Severity      string  `json:"severity"`
		FindingCount  int     `json:"findingCount"`
		LastPingAt    *string `json:"lastPingAt"`
		// Which fallbacks this competitor holds, so a reviewer reading the row's
		// findings knows the same submission means something different under them.
		AllowWebWithAgent bool `json:"allowWebWithAgent"`
		AllowWebOnly      bool `json:"allowWebOnly"`
	}

	items := []competitorRiskItem{}
	for rows.Next() {
		var item competitorRiskItem
		var pingTime *string
		if err := rows.Scan(&item.UserID, &item.Username, &item.DisplayName, &item.ProctorExempt, &item.Score, &item.Severity, &item.FindingCount, &pingTime, &item.AllowWebWithAgent, &item.AllowWebOnly); err != nil {
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
		SELECT f.id, f.rule_id, r.title, r.category, f.weight, f.occurrences,
		       f.evidence, f.submission_id, f.first_seen_at, f.last_seen_at
		FROM proctor_findings f
		JOIN proctor_rules r ON f.rule_id = r.id
		WHERE f.user_id = $1
		ORDER BY f.last_seen_at DESC;
	`, targetUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type findingItem struct {
		ID           string      `json:"id"`
		RuleID       string      `json:"ruleId"`
		Title        string      `json:"title"`
		Category     string      `json:"category"`
		Weight       int         `json:"weight"`
		Occurrences  int         `json:"occurrences"`
		Evidence     interface{} `json:"evidence"`
		SubmissionID *string     `json:"submissionId"`
		FirstSeenAt  string      `json:"firstSeenAt"`
		LastSeenAt   string      `json:"lastSeenAt"`
	}

	items := []findingItem{}
	for rows.Next() {
		var item findingItem
		if err := rows.Scan(&item.ID, &item.RuleID, &item.Title, &item.Category, &item.Weight,
			&item.Occurrences, &item.Evidence, &item.SubmissionID, &item.FirstSeenAt, &item.LastSeenAt); err != nil {
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

	// An exemption switches proctoring off for one person, so it must say who
	// granted it, why, and when it lapses. An open-ended flag with no reason is
	// how a break-glass control quietly becomes the normal path.
	if req.Exempt && req.Reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "a reason is required to grant an exemption"})
		return
	}
	if req.HoursValid <= 0 || req.HoursValid > 24 {
		req.HoursValid = 4
	}

	granter := currentUser(c)
	_, err := h.db.Exec(c.Request.Context(), `
		UPDATE users SET
			proctor_exempt            = $1,
			proctor_exempt_reason     = CASE WHEN $1 THEN $2 ELSE '' END,
			proctor_exempt_until      = CASE WHEN $1 THEN now() + make_interval(hours => $3) ELSE NULL END,
			proctor_exempt_granted_by = CASE WHEN $1 THEN $4::uuid ELSE NULL END
		WHERE id = $5;
	`, req.Exempt, req.Reason, req.HoursValid, granter.ID, targetID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

// MaxAccessGrantHours bounds a timed grant at a week. Anything longer is meant to
// outlast the contest, which is what the open-ended grant (hoursValid 0) is for.
const MaxAccessGrantHours = 168

// @Summary Update User Submission Access
// @Description Grant or revoke the two browser fallbacks for one competitor, independently. The desktop client is always allowed and is what every account starts with.
// @Tags Admin Proctoring
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "User ID"
// @Param request body updateAccessRequest true "Access payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/v1/admin/users/{id}/access [patch]
func (h *handler) updateUserProctorAccess(c *gin.Context) {
	targetID := c.Param("id")
	var req updateAccessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	grant := agent.AccessGrant{WebWithAgent: req.WebWithAgent, WebOnly: req.WebOnly}

	// Widening access costs observability, so it must say who widened it and why —
	// the same standard as an exemption. Revoking back to the desktop client needs no
	// justification.
	reason := strings.TrimSpace(req.Reason)
	if !grant.IsDefault() && reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "a reason is required to allow browser submissions"})
		return
	}
	if req.HoursValid < 0 || req.HoursValid > MaxAccessGrantHours {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "hoursValid must be between 0 (for the rest of the contest) and 168",
		})
		return
	}

	granter := currentUser(c)
	// The whole grant is written in one statement, so two organizers working the same
	// contestant cannot interleave into a combination neither of them chose.
	tag, err := h.db.Exec(c.Request.Context(), `
		UPDATE users SET
			proctor_allow_web_with_agent = $1,
			proctor_allow_web_only       = $2,
			proctor_access_reason        = CASE WHEN $1 OR $2 THEN $3 ELSE '' END,
			proctor_access_until         = CASE WHEN ($1 OR $2) AND $4 > 0
			                                   THEN now() + make_interval(hours => $4) ELSE NULL END,
			proctor_access_granted_by    = CASE WHEN $1 OR $2 THEN $5::uuid ELSE NULL END
		WHERE id = $6 AND role = 'competitor';
	`, grant.WebWithAgent, grant.WebOnly, reason, req.HoursValid, granter.ID, targetID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no competitor with that id"})
		return
	}

	// Accepted, but said out loud. Allowing submissions with no agent while refusing
	// them with one means this contestant unlocks their own submissions by stopping
	// proctoring — enforceable, occasionally intended, never worth doing silently.
	warning := ""
	if grant.Perverse() {
		warning = "this combination lets the contestant submit only while the proctor agent is stopped"
	}

	// The gate reads the grant per submission, so it takes effect on the
	// contestant's next attempt with no reload and no settings refresh to wait for.
	c.JSON(http.StatusOK, gin.H{
		"status":       "updated",
		"allowedModes": grant.Modes(),
		"webWithAgent": grant.WebWithAgent,
		"webOnly":      grant.WebOnly,
		"warning":      warning,
	})
}
