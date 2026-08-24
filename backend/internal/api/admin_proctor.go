package api

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

type updateExemptionRequest struct {
	Exempt     bool   `json:"exempt"`
	Reason     string `json:"reason"`
	HoursValid int    `json:"hoursValid"`
}

type updateAccessRequest struct {
	WebWithAgent bool   `json:"webWithAgent"`
	WebOnly      bool   `json:"webOnly"`
	Reason       string `json:"reason"`
	HoursValid   int    `json:"hoursValid"`
}

type postReviewRequest struct {
	UserID string `json:"userId" binding:"required"`
	Status string `json:"status" binding:"required"`
	Notes  string `json:"notes"`
}

type competitorRiskItem struct {
	UserID            string  `json:"userId"`
	Username          string  `json:"username"`
	DisplayName       string  `json:"displayName"`
	ProctorExempt     bool    `json:"proctorExempt"`
	Score             int     `json:"score"`
	Severity          string  `json:"severity"`
	FindingCount      int     `json:"findingCount"`
	LastPingAt        *string `json:"lastPingAt"`
	AllowWebWithAgent bool    `json:"allowWebWithAgent"`
	AllowWebOnly      bool    `json:"allowWebOnly"`
}

func (h *handler) listProctorRisk(ctx context.Context) ([]competitorRiskItem, error) {
	items, err := h.agents.ListProctorRisk(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]competitorRiskItem, len(items))
	for i, it := range items {
		result[i] = competitorRiskItem{
			UserID:            it.UserID,
			Username:          it.Username,
			DisplayName:       it.DisplayName,
			ProctorExempt:     it.ProctorExempt,
			Score:             it.Score,
			Severity:          it.Severity,
			FindingCount:      it.FindingCount,
			LastPingAt:        formatTimePtr(it.LastPingAt),
			AllowWebWithAgent: it.AllowWebWithAgent,
			AllowWebOnly:      it.AllowWebOnly,
		}
	}
	return result, nil
}

// @Summary List Competitor Risk Rollups
// @Description Fetch risk scores, severities, and finding counts for all competitors.
// @Tags Admin Proctoring
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/admin/proctor/risk [get]
func (h *handler) listAdminProctorRisk(c *gin.Context) {
	items, err := h.listProctorRisk(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
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
	findings, err := h.agents.GetProctorFindings(c.Request.Context(), targetUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

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

	items := make([]findingItem, len(findings))
	for i, f := range findings {
		items[i] = findingItem{
			ID:           f.ID,
			RuleID:       f.RuleID,
			Title:        f.Title,
			Category:     f.Category,
			Weight:       f.Weight,
			Occurrences:  f.Occurrences,
			Evidence:     f.Evidence,
			SubmissionID: f.SubmissionID,
			FirstSeenAt:  f.FirstSeenAt.UTC().Format(timeLayoutRFC3339Nano),
			LastSeenAt:   f.LastSeenAt.UTC().Format(timeLayoutRFC3339Nano),
		}
	}

	c.JSON(http.StatusOK, gin.H{"findings": items})
}

const timeLayoutRFC3339Nano = "2006-01-02T15:04:05.999999999Z07:00"

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

	if req.Exempt && req.Reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "a reason is required to grant an exemption"})
		return
	}
	if req.HoursValid <= 0 || req.HoursValid > 24 {
		req.HoursValid = 4
	}

	granter := currentUser(c)
	err := h.users.UpdateProctorExemption(c.Request.Context(), targetID, req.Exempt, req.HoursValid, req.Reason, granter.ID)
	if err != nil {
		if errors.Is(err, user.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

const MaxAccessGrantHours = 168

// @Summary Update User Submission Access
// @Description Grant or revoke browser fallbacks for one competitor.
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
	err := h.users.UpdateProctorAccess(c.Request.Context(), targetID, grant.WebWithAgent, grant.WebOnly, reason, req.HoursValid, granter.ID)
	if err != nil {
		if errors.Is(err, user.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "no competitor with that id"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	warning := ""
	if grant.Perverse() {
		warning = "this combination lets the contestant submit only while the proctor agent is stopped"
	}

	c.JSON(http.StatusOK, gin.H{
		"status":       "updated",
		"allowedModes": grant.Modes(),
		"webWithAgent": grant.WebWithAgent,
		"webOnly":      grant.WebOnly,
		"warning":      warning,
	})
}
