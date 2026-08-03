package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/api"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/db"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/session"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/team"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/telemetry"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

// @title MiniAlgothon API
// @version 1.0
// @description Algorithmic contest platform REST API & judge engine.
// @host localhost:8080
// @BasePath /
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// Best-effort: load .env for local dev; real env vars still win in prod.
	_ = godotenv.Load()
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	log.Info("database connected")

	if err := db.Migrate(cfg.DatabaseURL); err != nil {
		log.Error("migrations failed", "error", err)
		os.Exit(1)
	}
	log.Info("migrations applied")

	users := user.NewRepository(pool)
	sessions := session.NewRepository(pool)
	problems := problem.NewRepository(pool)
	teams := team.NewRepository(pool)
	telemetryRepo := telemetry.NewRepository(pool)

	rn, err := runner.New(runner.Config{
		CompileTimeout: cfg.RunCompileTimeout(),
		WallTimeout:    cfg.RunWallTimeout(),
		CPUSeconds:     float64(cfg.RunCPUSeconds),
		Memory:         cfg.RunMemory,
		IsolateBin:     cfg.RunIsolateBin,
		MaxConcurrent:  cfg.RunMaxConcurrent,
		RunReserve:     cfg.RunReserve,
		MaxQueue:       cfg.RunMaxQueue,
		MaxWait:        time.Duration(cfg.RunMaxWaitSeconds) * time.Second,
	})
	if err != nil {
		log.Error("runner configuration invalid", "error", err)
		os.Exit(1)
	}
	// Fail at boot rather than serving 500s once traffic arrives.
	if err := rn.CheckHost(ctx); err != nil {
		log.Error("sandbox host not ready", "error", err)
		os.Exit(1)
	}

	j := judge.New(pool, cfg.JudgeWorkers, log)
	j.SetRunner(rn)
	go j.Start(ctx)
	log.Info("sandbox ready", "boxes", cfg.RunMaxConcurrent)

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: api.NewRouter(cfg, j, rn, pool, users, sessions, problems, teams, telemetryRepo),
	}

	go func() {
		log.Info("server listening", "port", cfg.Port, "env", cfg.Env)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Error("shutdown failed", "error", err)
	}
	log.Info("server stopped")
}
