package api

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/contest"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/metrics"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/proctor"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/session"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/telemetry"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

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
	r.Use(metrics.GinRequestIDMiddleware(), metrics.GinMetricsMiddleware(), metrics.GinStructuredLoggingMiddleware(log), gin.Recovery(), corsMiddleware(cfg.AllowedOrigins))

	metrics.RegisterDBPoolCollector(pool)

	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil && log != nil {
		log.Error("invalid TRUSTED_PROXIES; trusting no proxy", "error", err)
		_ = r.SetTrustedProxies(nil)
	}

	proctorEval := proctor.NewEvaluator(pool, log)
	telemetryBatcher := telemetry.NewBatcher(pool, log)
	agentRepo := agent.NewRepository(pool)
	settings := agent.NewSettings(pool, log)
	agentService := agent.NewService(agentRepo, telemetryBatcher, proctorEval, settings, log)
	proctorGate := agent.NewGate(agentRepo, agentService, settings)
	contestRepo := contest.NewRepository(pool)
	contestManager := contest.NewManager(contestRepo, log)

	ctx := context.Background()
	if err := settings.Reload(ctx); err != nil && log != nil {
		log.Warn("failed to load contest settings; using defaults", "error", err)
	}
	if err := proctorEval.ReloadRules(ctx); err != nil && log != nil {
		log.Warn("failed to load rule catalogue; using default weights", "error", err)
	}
	if err := contestManager.Reload(ctx); err != nil && log != nil {
		log.Warn("failed to load contest state; using defaults", "error", err)
	}
	go settings.StartRefresher(ctx, 30*time.Second)
	go proctorEval.StartRulesRefresher(ctx, 30*time.Second)
	go agentService.StartSweeper(ctx, 30*time.Second)
	go contestManager.StartRefresher(ctx, 15*time.Second)

	if rn != nil {
		metrics.StartRunnerMetricsReporter(ctx, func() (int, int, int) {
			st := rn.Stats()
			return st.ActiveBoxes, st.TotalCapacity, st.WaitingQueue
		}, 5*time.Second)
	}

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
		contest:          contestManager,
		log:              log,
	}

	h.registerPublicRoutes(r)

	gated := requireProctorAccess(func(ctx context.Context, userID string, claimsDesktop bool) (agent.Decision, error) {
		d, _, err := proctorGate.Status(ctx, userID, claimsDesktop)
		return d, err
	}, log)

	v1 := r.Group("/api/v1")
	{
		h.registerCompetitorRoutes(v1, gated)
		h.registerAgentRoutes(v1)

		admin := v1.Group("/admin", h.requireUser, h.requireAdmin, rateLimitMiddleware(adminLimiter, userIDKeyFunc))
		h.registerAdminRoutes(admin)
	}

	return r
}

func (h *handler) registerPublicRoutes(r *gin.Engine) {
	r.GET("/healthz", rateLimitMiddleware(healthLimiter, peerIPKeyFunc), h.health)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	if !h.cfg.IsProduction() {
		r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}
}

func (h *handler) registerCompetitorRoutes(v1 *gin.RouterGroup, gated gin.HandlerFunc) {
	contestActive := requireContestActiveMiddleware(h.contest)
	submissionsAllowed := requireContestSubmissionsAllowedMiddleware(h.contest)

	v1.POST("/auth/login", maxBodySizeMiddleware(4_096), h.login)
	v1.POST("/auth/logout", h.logout)
	v1.GET("/me", h.requireUser, rateLimitMiddleware(readLimiter, userIDKeyFunc), h.me)
	v1.POST("/me/password", h.requireUser, maxBodySizeMiddleware(4_096), h.changePassword)
	v1.GET("/teams", h.requireUser, h.requireAdmin, h.listTeams)

	v1.GET("/problems", h.requireUser, rateLimitMiddleware(readLimiter, userIDKeyFunc), gated, h.listPublishedProblems)
	v1.GET("/problems/:slug", h.requireUser, rateLimitMiddleware(readLimiter, userIDKeyFunc), gated, contestActive, h.getPublishedProblemBySlug)

	v1.GET("/leaderboard", h.requireUser, rateLimitMiddleware(readLimiter, userIDKeyFunc), gated, h.getLeaderboard)
	v1.GET("/proctor/disclosure", h.getProctorDisclosure)
	v1.GET("/telemetry/self", h.requireUser, rateLimitMiddleware(proctorSelfLimiter, userIDKeyFunc), h.getProctorSelfStatus)

	v1.GET("/contest/state", h.getContestState)
	v1.POST("/run", h.requireUser, maxBodySizeMiddleware(100_000), rateLimitMiddleware(runLimiter, userIDKeyFunc), gated, contestActive, h.runCode)

	v1.POST("/submissions", h.requireUser, maxBodySizeMiddleware(100_000), rateLimitMiddleware(submissionLimiter, userIDKeyFunc), submissionsAllowed, h.createSubmission)
	v1.GET("/submissions", h.requireUser, rateLimitMiddleware(readLimiter, userIDKeyFunc), gated, h.listUserSubmissions)
	v1.GET("/submissions/stream", h.requireUser, rateLimitMiddleware(streamLimiter, userIDKeyFunc), gated, h.streamSubmissions)
	v1.GET("/submissions/:id", h.requireUser, rateLimitMiddleware(submissionStatusLimiter, userIDKeyFunc), gated, h.getSubmission)
}

func (h *handler) registerAgentRoutes(v1 *gin.RouterGroup) {
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
}

func (h *handler) registerAdminRoutes(admin *gin.RouterGroup) {
	admin.GET("/users", h.listUsers)
	admin.POST("/users", h.createUser)
	admin.POST("/users/bulk", h.bulkCreateUsers)
	admin.POST("/users/:id/reset-password", h.resetPassword)
	admin.PATCH("/users/:id/role", h.updateRole)
	admin.PATCH("/users/:id/suspend", h.suspendUser)
	admin.PATCH("/users/:id/exemption", h.updateUserProctorExemption)
	admin.PATCH("/users/:id/access", h.updateUserProctorAccess)
	admin.DELETE("/users/:id", h.deleteUser)

	admin.GET("/teams", h.listAdminTeams)
	admin.POST("/teams", h.createTeam)
	admin.PUT("/teams/:id", h.updateTeam)
	admin.DELETE("/teams/:id", h.deleteTeam)
	admin.POST("/teams/:id/members", h.addTeamMember)
	admin.DELETE("/teams/:id/members/:userId", h.removeTeamMember)

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
	admin.POST("/submissions/:id/review", h.reviewSubmission)
	admin.POST("/teams/:id/unstick", h.unstickTeamSubmissions)

	admin.GET("/monitoring", h.getAdminMonitoring)

	admin.GET("/telemetry", h.listAdminTelemetry)
	admin.GET("/proctor/risk", h.listAdminProctorRisk)
	admin.GET("/proctor/findings/:userId", h.getAdminProctorFindings)
	admin.GET("/proctor/overview", h.getAdminProctorOverview)
	admin.GET("/proctor/timeline/:userId", h.getAdminProctorTimeline)
	admin.GET("/proctor/agents", h.listAdminAgents)
	admin.POST("/proctor/agents/:id/revoke", h.revokeAgent)

	admin.GET("/contest/state", h.getContestState)
	admin.POST("/contest/start", h.adminStartContest)
	admin.POST("/contest/pause", h.adminPauseContest)
	admin.POST("/contest/resume", h.adminResumeContest)
	admin.POST("/contest/extend", h.adminExtendContest)
	admin.POST("/contest/reset", h.adminResetContest)
	admin.POST("/contest/end", h.adminEndContest)
	admin.PUT("/contest/settings", h.adminUpdateContestSettings)
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

func peerIPKeyFunc(c *gin.Context) string {
	return c.RemoteIP()
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
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Requested-With", attestHeader, clientHeader},
		AllowCredentials: true,
	}
	return cors.New(c)
}
