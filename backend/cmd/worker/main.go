package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/db"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/runner"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	_ = godotenv.Load()
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL, cfg.DBMaxConns, cfg.DBMinConns)
	if err != nil {
		log.Error("worker database connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	log.Info("worker database connected")

	rn, err := runner.New(runner.Config{
		CompileTimeout: cfg.RunCompileTimeout(),
		WallTimeout:    cfg.RunWallTimeout(),
		CPUSeconds:     float64(cfg.RunCPUSeconds),
		Memory:         cfg.RunMemory,
		IsolateBin:     cfg.RunIsolateBin,
		WorkRoot:       cfg.RunWorkRoot,
		CPUList:        cfg.RunCPUList,
		MaxConcurrent:  cfg.RunMaxConcurrent,
		RunReserve:     cfg.RunReserve,
		MaxQueue:       cfg.RunMaxQueue,
		MaxWait:        time.Duration(cfg.RunMaxWaitSeconds) * time.Second,
		RequireIsolate: cfg.IsProduction(),
	})
	if err != nil {
		log.Error("worker runner configuration invalid", "error", err)
		os.Exit(1)
	}

	if err := rn.CheckHost(ctx); err != nil {
		log.Error("worker sandbox host check failed", "error", err)
		os.Exit(1)
	}
	log.Info("worker sandbox initialized and host verified")

	j := judge.New(pool, cfg.JudgeWorkers, log)
	j.SetRunner(rn)

	log.Info("judge worker service started", "workers", cfg.JudgeWorkers, "boxes", cfg.RunMaxConcurrent)
	j.Start(ctx)
	log.Info("judge worker service stopped cleanly")
}
