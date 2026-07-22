package api

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
)

func NewRouter(cfg config.Config, j *judge.Judge, pool *pgxpool.Pool) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), corsMiddleware(cfg.AllowedOrigins))

	h := &handler{judge: j, db: pool}

	r.GET("/healthz", h.health)

	v1 := r.Group("/api/v1")
	{
		v1.POST("/submissions", h.createSubmission)
		v1.GET("/submissions/:id", h.getSubmission)
	}

	return r
}

func corsMiddleware(origins []string) gin.HandlerFunc {
	c := cors.DefaultConfig()
	c.AllowOrigins = origins
	c.AllowHeaders = []string{"Origin", "Content-Type"}
	return cors.New(c)
}
