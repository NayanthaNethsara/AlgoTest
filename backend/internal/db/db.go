package db

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Connect opens a pgx connection pool and verifies connectivity before returning.
//
// maxConns and minConns are set explicitly because the pgxpool default of
// max(4, NumCPU) is sized for a single-purpose service. This pool is shared by the
// judge, the submission path and telemetry ingest, and ingest is reached by the
// whole fleet in the same second whenever a shared condition changes — a saturated
// pool there stalls heartbeats, which reads as agents going stale, which locks
// submissions for everyone. A url that already carries pool_max_conns wins, so a
// deployment can still override this without a rebuild.
func Connect(ctx context.Context, url string, maxConns, minConns int32) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}

	if !strings.Contains(url, "pool_max_conns") && maxConns > 0 {
		cfg.MaxConns = maxConns
	}
	// Warm connections cost an idle backend each; the burst they absorb is worth it.
	// Clamped below MaxConns so a misconfigured pair cannot fail pool creation.
	if minConns > 0 && minConns < cfg.MaxConns {
		cfg.MinConns = minConns
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return pool, nil
}
