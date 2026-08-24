package api

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// disclosure is served rather than compiled into the client so the wording can be
// corrected without redistributing 300 binaries. The agent keeps a copy for the
// case where it has not reached the server yet.
//
// It must stay truthful about the background agent: an autostarting proctor that
// keeps running after the window is closed cannot claim to collect "nothing when
// the app is closed".
// ConsentVersion identifies the disclosure wording below. Bump it whenever that
// wording changes: it is what enrollment records in the consent log, and what
// tells organizers who is still running under superseded terms.
const ConsentVersion = "2026-08-no-provenance"

// probedPorts is the list the agent sweeps on 127.0.0.1. The disclosure claims a
// *published* list, so it has to actually be published — a contestant cannot check
// a promise against a constant compiled into a binary they were handed.
var probedPorts = []gin.H{
	{"port": 11434, "product": "Ollama"},
	{"port": 1234, "product": "LM Studio"},
	{"port": 1337, "product": "Jan"},
	{"port": 4891, "product": "GPT4All"},
	{"port": 8080, "product": "llama-server / vLLM"},
	{"port": 8000, "product": "vLLM / LocalAI"},
	{"port": 5000, "product": "KoboldCpp"},
}

var disclosure = gin.H{
	"version": ConsentVersion,
	"summary": "The proctor client watches for local AI runtimes and a second route to the internet. It runs in the background for the duration of the contest and shows a tray icon the whole time it is running.",
	"collected": []string{
		"Which application has keyboard focus, and for how long",
		"Names of running processes that match a published denylist, plus the total process count",
		"Which of a published list of localhost ports answer as a local LLM API, listed in full below",
		"Whether this machine can reach the public internet, by opening a TCP connection to 1.1.1.1:53 and 8.8.8.8:53",
		"Operating system, architecture, LAN IP address, and agent version",
		"The IP address and browser user-agent the portal is opened from",
	},
	"notCollected": []string{
		"No screenshots, screen recording, camera or microphone",
		"No keystroke contents",
		"No clipboard contents",
		"No full process list",
		"No file names or paths",
		"No browser history",
		"No packet capture",
		"No code other than what you deliberately submit",
		"No typing or paste statistics for the code you write",
	},
	"lifecycle": []string{
		"The agent collects only while enrolled and running, and starts at login for the duration of the contest",
		"A tray icon is visible the entire time it is running — there is no hidden state",
		"You can stop it at any time from the tray in one click; doing so only locks scored submissions",
		"Autostart is removable, and uninstalling revokes the agent's credential",
		"The agent listens on 127.0.0.1 (one of ports 47615-47619) so the contest page can confirm it is running on this same machine. It answers only the contest portal, and serves only its own status",
	},
	"retention": "Heartbeats and events are kept 30 days. Gaps, findings and reviews are kept 90 days so appeals can be heard.",
	"policy":    "Signals are flagged for human review. Nothing here disqualifies anyone automatically.",
}

// @Summary Proctoring Disclosure
// @Description Full disclosure of what the proctor agent collects, shown before enrollment.
// @Tags Proctoring
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/proctor/disclosure [get]
func (h *handler) getProctorDisclosure(c *gin.Context) {
	policy := h.agentService.Policy()
	c.JSON(http.StatusOK, gin.H{
		"disclosure":   disclosure,
		"policy":       policy,
		"probedPorts":  probedPorts,
		"processTerms": policy.ProcessDenylist,
	})
}

// @Summary Proctoring Fleet Overview
// @Description Fleet-wide agent liveness counts and any open telemetry incident.
// @Tags Admin Proctoring
// @Produce json
// @Security BearerAuth
// @Success 200 {object} agent.Overview
// @Router /api/v1/admin/proctor/overview [get]
func (h *handler) getAdminProctorOverview(c *gin.Context) {
	overview, err := h.agents.Overview(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, overview)
}

// @Summary Contestant Evidence Timeline
// @Description One ordered axis of telemetry events, blackouts, findings, submissions and enrolments.
// @Tags Admin Proctoring
// @Produce json
// @Security BearerAuth
// @Param userId path string true "User ID"
// @Param limit query int false "Maximum entries (default 250, max 500)"
// @Success 200 {object} agent.Timeline
// @Router /api/v1/admin/proctor/timeline/{userId} [get]
func (h *handler) getAdminProctorTimeline(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))

	timeline, err := h.agents.Timeline(c.Request.Context(), c.Param("userId"), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, timeline)
}

// agentItem is one enrollment row: a machine a competitor has registered, live
// or revoked.
type agentItem struct {
	ID            string  `json:"id"`
	UserID        string  `json:"userId"`
	Username      string  `json:"username"`
	DisplayName   string  `json:"displayName"`
	MachineID     string  `json:"machineId"`
	Platform      string  `json:"platform"`
	AgentVersion  string  `json:"agentVersion"`
	LoopbackPort  int     `json:"loopbackPort"`
	EnrolledAt    string  `json:"enrolledAt"`
	LastSeenAt    *string `json:"lastSeenAt"`
	StoppedAt     *string `json:"stoppedAt"`
	StoppedReason string  `json:"stoppedReason"`
	RevokedAt     *string `json:"revokedAt"`
	RevokedReason string  `json:"revokedReason"`
	InGap         bool    `json:"inGap"`
}

// formatTimePtr renders a nullable timestamptz as the ISO-8601 string the
// console expects.
//
// pgx decodes timestamptz into time.Time and refuses a string destination in
// binary format, so scanning one of these columns straight into a struct's
// string field fails the whole query -- which is what silently emptied the
// agents and risk panels. Scan into a time, format here.
func formatTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.UTC().Format(time.RFC3339Nano)
	return &s
}

func (h *handler) listAgents(ctx context.Context) ([]agentItem, error) {
	agents, err := h.agents.ListAgents(ctx)
	if err != nil {
		return nil, err
	}

	items := make([]agentItem, len(agents))
	for i, it := range agents {
		items[i] = agentItem{
			ID:            it.ID,
			UserID:        it.UserID,
			Username:      it.Username,
			DisplayName:   it.DisplayName,
			MachineID:     it.MachineID,
			Platform:      it.Platform,
			AgentVersion:  it.AgentVersion,
			LoopbackPort:  it.LoopbackPort,
			EnrolledAt:    it.EnrolledAt.UTC().Format(time.RFC3339Nano),
			LastSeenAt:    formatTimePtr(it.LastSeenAt),
			StoppedAt:     formatTimePtr(it.StoppedAt),
			StoppedReason: it.StoppedReason,
			RevokedAt:     formatTimePtr(it.RevokedAt),
			RevokedReason: it.RevokedReason,
			InGap:         it.InGap,
		}
	}

	return items, nil
}

// @Summary List Enrolled Agents
// @Description Enrollment history and liveness per competitor, including revoked enrollments.
// @Tags Admin Proctoring
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/admin/proctor/agents [get]
func (h *handler) listAdminAgents(c *gin.Context) {
	items, err := h.listAgents(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// A missing incident flag is not worth failing the list over: the rows are
	// what the organizer came for, and the flag only suppresses gap alarms.
	incidentOpen, err := h.agents.IncidentOpen(c.Request.Context())
	if err != nil {
		incidentOpen = false
	}

	c.JSON(http.StatusOK, gin.H{"agents": items, "incidentOpen": incidentOpen})
}

type revokeAgentRequest struct {
	Reason string `json:"reason"`
}

// @Summary Revoke An Agent Enrollment
// @Description Invalidate an agent credential, forcing a fresh enrollment on that machine.
// @Tags Admin Proctoring
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Agent ID"
// @Success 200 {object} map[string]string
// @Router /api/v1/admin/proctor/agents/{id}/revoke [post]
func (h *handler) revokeAgent(c *gin.Context) {
	var req revokeAgentRequest
	_ = c.ShouldBindJSON(&req)
	if req.Reason == "" {
		req.Reason = "revoked by organizer"
	}

	if err := h.agents.Revoke(c.Request.Context(), c.Param("id"), req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "revoked"})
}
