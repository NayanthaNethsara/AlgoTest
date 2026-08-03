package api

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	_ "github.com/NayanthaNethsara/mini-algothon/backend/docs"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/session"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

func NewRouter(cfg config.Config, j *judge.Judge, rn *runner.Runner, pool *pgxpool.Pool, users *user.Repository, sessions *session.Repository, problems *problem.Repository, teams *team.Repository) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), corsMiddleware(cfg.AllowedOrigins))

	h := &handler{cfg: cfg, judge: j, runner: rn, db: pool, users: users, sessions: sessions, problems: problems, teams: teams}

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

		admin := v1.Group("/admin", h.requireUser, h.requireAdmin)
		{
			admin.GET("/users", h.listUsers)
			admin.POST("/users", h.createUser)
			admin.POST("/users/bulk", h.bulkCreateUsers)
			admin.POST("/users/:id/reset-password", h.resetPassword)
			admin.PATCH("/users/:id/role", h.updateRole)
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
			admin.PUT("/problems/:id/tests", h.replaceTestCases)
		}

		v1.POST("/run", h.requireUser, h.runCode)

		v1.POST("/submissions", h.requireUser, h.createSubmission)
		v1.GET("/submissions/:id", h.requireUser, h.getSubmission)
	}

	return r
}

func corsMiddleware(origins []string) gin.HandlerFunc {
	c := cors.DefaultConfig()
	c.AllowOrigins = origins
	c.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}
	c.AllowHeaders = []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Requested-With"}
	c.AllowCredentials = true
	return cors.New(c)
}
