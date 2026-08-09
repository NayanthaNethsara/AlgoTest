package api

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	_ "github.com/NayanthaNethsara/mini-algothon/backend/docs"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/proctor"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/session"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/telemetry"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

// attestHeader carries the loopback attestation nonce the portal read from the
// agent over 127.0.0.1.
const attestHeader = "X-Agent-Attest"

func NewRouter(
	cfg config.Config,
	j *judge.Judge,
	rn *runner.Runner,
	pool *pgxpool.Pool,
	users *user.Repository,
	sessions *session.Repository,
	problems *problem.Repository,
	teams *team.Repository,
	telemetryRepo *telemetry.Repository,
	log *slog.Logger,
) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), corsMiddleware(cfg.AllowedOrigins))

	proctorEval := proctor.NewEvaluator(pool, log)
	telemetryBatcher := telemetry.NewBatcher(pool, log)
	agentRepo := agent.NewRepository(pool)
	agentService := agent.NewService(agentRepo, telemetryBatcher, proctorEval, log)
	settings := agent.NewSettings(pool)
	proctorGate := agent.NewGate(agentRepo, agentService, settings)

	ctx := context.Background()
	if err := settings.Reload(ctx); err != nil && log != nil {
		log.Warn("failed to load contest settings; using defaults", "error", err)
	}
	go settings.StartRefresher(ctx, 30*time.Second)
	go agentService.StartSweeper(ctx, 30*time.Second)

	h := &handler{
		cfg:              cfg,
		judge:            j,
		runner:           rn,
		db:               pool,
		users:            users,
		sessions:         sessions,
		problems:         problems,
		teams:            teams,
		telemetry:        telemetryRepo,
		agents:           agentRepo,
		agentService:     agentService,
		proctorGate:      proctorGate,
		proctorEvaluator: proctorEval,
		telemetryBatcher: telemetryBatcher,
	}

	r.GET("/healthz", h.health)
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	v1 := r.Group("/api/v1")
	{
		v1.POST("/auth/login", h.login)
		v1.POST("/auth/logout", h.logout)
		v1.GET("/me", h.requireUser, h.me)
		v1.GET("/teams", h.requireUser, h.listTeams)

		v1.GET("/problems", h.requireUser, h.listPublishedProblems)
		v1.GET("/problems/:slug", h.requireUser, h.getPublishedProblemBySlug)

		v1.GET("/leaderboard", h.requireUser, h.getLeaderboard)

		v1.GET("/proctor/disclosure", h.getProctorDisclosure)

		// The proctor agent authenticates with its own credential, so it keeps
		// reporting whether or not anyone is signed into the portal.
		ag := v1.Group("/agent")
		{
			ag.POST("/enroll", maxBodySizeMiddleware(4_096), h.enrollAgent)
			ag.POST("/heartbeat", h.requireAgent, maxBodySizeMiddleware(64_000),
				rateLimitMiddleware(agentHeartbeatLimiter, agentIDKeyFunc), h.agentHeartbeat)
			ag.POST("/events", h.requireAgent, maxBodySizeMiddleware(1_000_000),
				rateLimitMiddleware(agentEventsLimiter, agentIDKeyFunc), h.agentEvents)
			ag.POST("/shutdown", h.requireAgent, maxBodySizeMiddleware(4_096), h.agentShutdown)
			ag.GET("/rules", h.requireAgent, h.agentRules)
		}

		v1.POST("/telemetry/ping", h.requireUser, maxBodySizeMiddleware(4_096),
			rateLimitMiddleware(telemetryPingLimiter, userIDKeyFunc), h.pingWebTelemetry)
		v1.GET("/telemetry/self", h.requireUser,
			rateLimitMiddleware(proctorSelfLimiter, userIDKeyFunc), h.getProctorSelfStatus)

		admin := v1.Group("/admin", h.requireUser, h.requireAdmin)
		{
			admin.GET("/users", h.listUsers)
			admin.POST("/users", h.createUser)
			admin.POST("/users/bulk", h.bulkCreateUsers)
			admin.POST("/users/:id/reset-password", h.resetPassword)
			admin.PATCH("/users/:id/role", h.updateRole)
			admin.PATCH("/users/:id/exemption", h.updateUserProctorExemption)
			admin.DELETE("/users/:id", h.deleteUser)

			admin.GET("/teams", h.listAdminTeams)
			admin.POST("/teams", h.createTeam)
			admin.PUT("/teams/:id", h.updateTeam)
			admin.DELETE("/teams/:id", h.deleteTeam)
			admin.POST("/teams/:id/members", h.addTeamMember)
			admin.DELETE("/teams/:id/members/:userId", h.removeTeamMember)
			admin.POST("/admins", h.createAdminUser)

			admin.GET("/problems", h.listAllProblems)
			admin.POST("/problems", h.createProblem)
			admin.GET("/problems/:id", h.getAdminProblemByID)
			admin.PUT("/problems/:id", h.updateProblem)
			admin.PATCH("/problems/:id/publish", h.setProblemPublished)
			admin.DELETE("/problems/:id", h.deleteProblem)
			admin.GET("/problems/:id/tests", h.getAdminProblemTests)
			admin.PUT("/problems/:id/tests", h.replaceTestCases)

			admin.GET("/submissions", h.listAdminSubmissions)
			admin.POST("/submissions/:id/rejudge", h.rejudgeSubmission)
			admin.POST("/submissions/:id/cancel", h.cancelSubmission)
			admin.POST("/teams/:id/unstick", h.unstickTeamSubmissions)

			admin.GET("/telemetry", h.listAdminTelemetry)
			admin.GET("/proctor/risk", h.listAdminProctorRisk)
			admin.GET("/proctor/findings/:userId", h.getAdminProctorFindings)
			admin.GET("/proctor/overview", h.getAdminProctorOverview)
			admin.GET("/proctor/timeline/:userId", h.getAdminProctorTimeline)
			admin.GET("/proctor/agents", h.listAdminAgents)
			admin.POST("/proctor/agents/:id/revoke", h.revokeAgent)
		}

		v1.POST("/run", h.requireUser, maxBodySizeMiddleware(100_000), rateLimitMiddleware(runLimiter, userIDKeyFunc), h.runCode)

		v1.POST("/submissions", h.requireUser, maxBodySizeMiddleware(100_000), rateLimitMiddleware(submissionLimiter, userIDKeyFunc), h.createSubmission)
		v1.GET("/submissions/stream", h.requireUser, h.streamSubmissions)
		v1.GET("/submissions/:id", h.requireUser, rateLimitMiddleware(submissionStatusLimiter, userIDKeyFunc), h.getSubmission)
	}

	return r
}

func userIDKeyFunc(c *gin.Context) string {
	u, exists := c.Get(contextUserKey)
	if !exists {
		return ""
	}
	if usr, ok := u.(user.User); ok {
		return usr.ID
	}
	return ""
}

func agentIDKeyFunc(c *gin.Context) string {
	a, exists := c.Get(contextAgentKey)
	if !exists {
		return ""
	}
	if ag, ok := a.(agent.Agent); ok {
		return ag.ID
	}
	return ""
}

func corsMiddleware(origins []string) gin.HandlerFunc {
	c := cors.Config{
		AllowOriginFunc: func(origin string) bool {
			if strings.HasPrefix(origin, "tauri://") || strings.HasPrefix(origin, "http://tauri.localhost") || strings.HasPrefix(origin, "https://tauri.localhost") {
				return true
			}
			for _, o := range origins {
				if o == origin || o == "*" {
					return true
				}
			}
			return false
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Requested-With", attestHeader},
		AllowCredentials: true,
	}
	return cors.New(c)
}
