package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/auth"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

const contextAgentKey = "proctor_agent"

// MaxBufferedHeartbeats bounds one replay flush. The agent's ring buffer holds an
// hour; anything larger is not a reconnect.
const MaxBufferedHeartbeats = 300

func currentAgent(c *gin.Context) agent.Agent {
	return c.MustGet(contextAgentKey).(agent.Agent)
}

// requireAgent authenticates the proctor agent's own credential. Deliberately
// separate from requireUser: the agent must keep reporting whether or not anyone
// is signed into the portal, in the desktop shell or a browser.
func (h *handler) requireAgent(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "agent token required"})
		return
	}
	token := strings.TrimPrefix(authHeader, "Bearer ")
	if token == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "agent token required"})
		return
	}

	a, err := h.agents.GetByToken(c.Request.Context(), agent.HashToken(token))
	if err != nil {
		// A revoked enrollment is terminal, and the client must stop retrying and
		// re-enroll rather than hammering a dead token for four hours.
		if err == agent.ErrRevoked {
			c.AbortWithStatusJSON(http.StatusGone, gin.H{"error": "enrollment revoked", "code": "ENROLLMENT_REVOKED"})
			return
		}
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unknown agent token"})
		return
	}

	c.Set(contextAgentKey, a)
	c.Next()
}

// @Summary Enroll Proctor Agent
// @Description Exchange contestant credentials for a long-lived agent credential.
// @Tags Agent
// @Accept json
// @Produce json
// @Param request body agent.EnrollRequest true "Enrollment payload"
// @Success 200 {object} agent.EnrollResponse
// @Failure 401 {object} map[string]string
// @Router /api/v1/agent/enroll [post]
func (h *handler) enrollAgent(c *gin.Context) {
	var req agent.EnrollRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ip := c.ClientIP()
	if !loginIPLimiter.Get(ip).Allow() || !loginUserLimiter.Get(strings.ToLower(req.Username)).Allow() {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many enrollment attempts. Please wait a moment."})
		return
	}

	loginSemaphore <- struct{}{}
	u, hash, err := h.users.GetForLogin(c.Request.Context(), req.Username)
	if err != nil {
		auth.DummyCompare(req.Password)
		<-loginSemaphore
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}
	ok := auth.CheckPassword(hash, req.Password)
	<-loginSemaphore
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}
	if u.Role != user.RoleCompetitor {
		c.JSON(http.StatusForbidden, gin.H{"error": "only competitor accounts enroll a proctor agent"})
		return
	}

	token, err := agent.NewToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue agent token"})
		return
	}

	agentID, rebound, err := h.agents.Enroll(
		c.Request.Context(), u.ID, req.MachineID, agent.HashToken(token),
		req.Platform, req.AgentVersion, req.ConsentVersion,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to enroll agent"})
		return
	}

	if rebound && h.agentService != nil {
		h.agentService.OnRebound(c.Request.Context(), u.ID, req.MachineID)
	}

	c.JSON(http.StatusOK, agent.EnrollResponse{
		AgentID:     agentID,
		AgentToken:  token,
		UserID:      u.ID,
		Username:    u.Username,
		DisplayName: u.DisplayName,
		Policy:      h.agentService.Policy(),
	})
}

// @Summary Agent Heartbeat
// @Description Report endpoint signals and agent liveness.
// @Tags Agent
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body agent.Heartbeat true "Heartbeat payload"
// @Success 202 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Router /api/v1/agent/heartbeat [post]
func (h *handler) agentHeartbeat(c *gin.Context) {
	a := currentAgent(c)

	var hb agent.Heartbeat
	if err := c.ShouldBindJSON(&hb); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid heartbeat payload"})
		return
	}

	if err := h.agentService.Heartbeat(c.Request.Context(), a, hb, c.ClientIP()); err != nil {
		if err == agent.ErrUnknownAgent {
			c.JSON(http.StatusConflict, gin.H{"error": "heartbeat rejected", "code": "SEQ_REPLAY"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record heartbeat"})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{"status": "accepted"})
}

// @Summary Flush Buffered Heartbeats
// @Description Replay heartbeats an agent buffered while the server was unreachable.
// @Tags Agent
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body agent.EventsRequest true "Buffered heartbeats"
// @Success 202 {object} map[string]interface{}
// @Router /api/v1/agent/events [post]
func (h *handler) agentEvents(c *gin.Context) {
	a := currentAgent(c)

	var req agent.EventsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid events payload"})
		return
	}
	if len(req.Heartbeats) > MaxBufferedHeartbeats {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "too many buffered heartbeats in one flush"})
		return
	}

	accepted := 0
	for _, hb := range req.Heartbeats {
		hb.Buffered = true
		if err := h.agentService.Heartbeat(c.Request.Context(), a, hb, c.ClientIP()); err != nil {
			continue
		}
		accepted++
	}

	c.JSON(http.StatusAccepted, gin.H{"status": "accepted", "count": accepted})
}

// @Summary Agent Shutdown
// @Description Record a deliberate stop so the blackout is not read as evasion.
// @Tags Agent
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string]string
// @Router /api/v1/agent/shutdown [post]
func (h *handler) agentShutdown(c *gin.Context) {
	a := currentAgent(c)

	var req agent.ShutdownRequest
	_ = c.ShouldBindJSON(&req)

	if err := h.agentService.Shutdown(c.Request.Context(), a, req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record shutdown"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "recorded"})
}

// @Summary Agent Policy And Rules
// @Description Fetch cadences and detection denylists so organizers can tune them without rebuilding clients.
// @Tags Agent
// @Produce json
// @Security BearerAuth
// @Success 200 {object} agent.Policy
// @Router /api/v1/agent/rules [get]
func (h *handler) agentRules(c *gin.Context) {
	c.JSON(http.StatusOK, h.agentService.Policy())
}
