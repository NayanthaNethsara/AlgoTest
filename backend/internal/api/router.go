package api

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/session"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

func NewRouter(cfg config.Config, j *judge.Judge, rn *runner.Runner, pool *pgxpool.Pool, users *user.Repository, sessions *session.Repository, problems *problem.Repository) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), corsMiddleware(cfg.AllowedOrigins))

	h := &handler{cfg: cfg, judge: j, runner: rn, db: pool, users: users, sessions: sessions, problems: problems}

	r.GET("/healthz", h.health)

	v1 := r.Group("/api/v1")
	{
		v1.POST("/auth/login", h.login)
		v1.POST("/auth/logout", h.logout)
		v1.GET("/me", h.requireUser, h.me)

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

			admin.GET("/problems", h.listAllProblems)
			admin.POST("/problems", h.createProblem)
			admin.GET("/problems/:id", h.getAdminProblemByID)
			admin.PUT("/problems/:id", h.updateProblem)
			admin.PATCH("/problems/:id/publish", h.setProblemPublished)
			admin.DELETE("/problems/:id", h.deleteProblem)
			admin.PUT("/problems/:id/tests", h.replaceTestCases)
		}

		v1.POST("/run", h.requireUser, h.runCode)

		v1.POST("/submissions", h.createSubmission)
		v1.GET("/submissions/:id", h.getSubmission)
	}

	return r
}

func corsMiddleware(origins []string) gin.HandlerFunc {
	c := cors.DefaultConfig()
	c.AllowOrigins = origins
	c.AllowHeaders = []string{"Origin", "Content-Type", "Authorization"}
	return cors.New(c)
}
