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

	_ "github.com/NayanthaNethsara/mini-algothon/backend/docs"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
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

// portalClientIP resolves the contestant's own address, and reports whether that
// resolution can be believed.
//
// Portal traffic reaches the API through the Next server's server actions, so the
// direct peer is always the portal, never the contestant. The forwarded address is
// only meaningful when a *configured* trusted proxy supplied it — gin returns the
// direct peer otherwise, and treating that as the contestant would mean comparing
// the portal host against the agent's LAN IP and calling the mismatch evidence.
// Callers that record IP-derived findings must drop them when trusted is false.
func portalClientIP(c *gin.Context) (ip string, trusted bool) {
	client := c.ClientIP()
	return client, client != c.RemoteIP()
}

// attestHeader carries the loopback attestation nonce the portal read from the
// agent over 127.0.0.1.
const attestHeader = "X-Agent-Attest"

// clientHeader carries the portal's answer to "which window is this?", forwarded
// from the marker the desktop client sets in the page it opens.
//
// It is a claim, not proof: the marker lives in a readable cookie, so a browser can
// be made to send it. The gate believes it only where the agent independently
// reports its shell process alive, which means forging it requires running the
// desktop client — and therefore being proctored — anyway.
const (
	clientHeader       = "X-Algothon-Client"
	clientValueDesktop = "desktop"
)

// portalClaimsDesktop reports whether this request says it came from the desktop
// client's own window.
func portalClaimsDesktop(c *gin.Context) bool {
	return strings.EqualFold(strings.TrimSpace(c.GetHeader(clientHeader)), clientValueDesktop)
}

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

	// Gin trusts every proxy by default, which would let any caller that can reach
	// the API set the IP recorded against a submission with a forged header. An
	// empty TRUSTED_PROXIES trusts none, so ClientIP falls back to the direct peer.
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil && log != nil {
		log.Error("invalid TRUSTED_PROXIES; trusting no proxy", "error", err)
		_ = r.SetTrustedProxies(nil)
	}

	proctorEval := proctor.NewEvaluator(pool, log)
	telemetryBatcher := telemetry.NewBatcher(pool, log)
	agentRepo := agent.NewRepository(pool)
	// Settings owns the agent policy, so it is constructed before the service that
	// serves that policy to agents and evaluates their reports against it.
	settings := agent.NewSettings(pool, log)
	agentService := agent.NewService(agentRepo, telemetryBatcher, proctorEval, settings, log)
	proctorGate := agent.NewGate(agentRepo, agentService, settings)

	ctx := context.Background()
	// Both caches are primed synchronously: serving one request against
	// compiled-in defaults when the real policy is a query away would mean
	// evaluating a contestant under rules an organizer had already changed.
	if err := settings.Reload(ctx); err != nil && log != nil {
		log.Warn("failed to load contest settings; using defaults", "error", err)
	}
	if err := proctorEval.ReloadRules(ctx); err != nil && log != nil {
		log.Warn("failed to load rule catalogue; using default weights", "error", err)
	}
	go settings.StartRefresher(ctx, 30*time.Second)
	go proctorEval.StartRulesRefresher(ctx, 30*time.Second)
	go agentService.StartSweeper(ctx, 30*time.Second)

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
		log:              log,
	}

	r.GET("/healthz", h.health)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))
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

		// The portal's status poll also records browser presence, so there is no
		// separate ping endpoint to keep in step with it.
		v1.GET("/telemetry/self", h.requireUser,
			rateLimitMiddleware(proctorSelfLimiter, userIDKeyFunc), h.getProctorSelfStatus)

		admin := v1.Group("/admin", h.requireUser, h.requireAdmin,
			rateLimitMiddleware(adminLimiter, userIDKeyFunc))
		{
			admin.GET("/users", h.listUsers)
			admin.POST("/users", h.createUser)
			admin.POST("/users/bulk", h.bulkCreateUsers)
			admin.POST("/users/:id/reset-password", h.resetPassword)
			admin.PATCH("/users/:id/role", h.updateRole)
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
		v1.GET("/submissions", h.requireUser, h.listUserSubmissions)
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
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Requested-With", attestHeader, clientHeader},
		AllowCredentials: true,
	}
	return cors.New(c)
}
