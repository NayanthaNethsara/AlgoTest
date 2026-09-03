package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/contest"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/proctor"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/session"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/telemetry"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

type handler struct {
	cfg              config.Config
	judge            *judge.Judge
	runner           *runner.Runner
	db               *pgxpool.Pool
	users            *user.Repository
	sessions         *session.Repository
	problems         *problem.Repository
	teams            *team.Repository
	telemetry        *telemetry.Repository
	agents           *agent.Repository
	agentService     *agent.Service
	agentSettings    *agent.Settings
	proctorGate      *agent.Gate
	proctorEvaluator *proctor.Evaluator
	telemetryBatcher *telemetry.Batcher
	contest          *contest.Manager
	log              *slog.Logger
}

func currentUser(c *gin.Context) user.User {
	return c.MustGet(contextUserKey).(user.User)
}

func (h *handler) requireAdmin(c *gin.Context) {
	if currentUser(c).Role != user.RoleAdmin {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin only"})
		return
	}
	c.Next()
}

// @Summary System Health Check
// @Description Check backend database connection and API service health status.
// @Tags Health
// @Produce json
// @Success 200 {object} map[string]string
// @Failure 533 {object} map[string]string
// @Router /healthz [get]
func (h *handler) health(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	if err := h.db.Ping(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "degraded", "database": "down"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "database": "up", "ci/cd": "ok"})
}

// @Summary List Teams
// @Description Fetch all teams and their assigned member accounts.
// @Tags Teams
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string][]team.Team
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/teams [get]
func (h *handler) listTeams(c *gin.Context) {
	teams, err := h.teams.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list teams"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"teams": teams})
}
