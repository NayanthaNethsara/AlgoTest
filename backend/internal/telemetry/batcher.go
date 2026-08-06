package telemetry

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type heartbeatItem struct {
	userID           string
	teamID           *string
	activeWindow     string
	runningProcesses []string
	osInfo           string
	ipAddress        string
	lastPingAt       time.Time
}

type Batcher struct {
	pool    *pgxpool.Pool
	ch      chan heartbeatItem
	log     *slog.Logger
	wg      sync.WaitGroup
	ctx     context.Context
	cancel  context.CancelFunc
}

func NewBatcher(pool *pgxpool.Pool, log *slog.Logger) *Batcher {
	ctx, cancel := context.WithCancel(context.Background())
	b := &Batcher{
		pool:   pool,
		ch:     make(chan heartbeatItem, 5000),
		log:    log,
		ctx:    ctx,
		cancel: cancel,
	}
	b.wg.Add(1)
	go b.worker()
	return b
}

func (b *Batcher) Enqueue(userID string, teamID *string, req PingRequest, clientIP string) {
	select {
	case b.ch <- heartbeatItem{
		userID:           userID,
		teamID:           teamID,
		activeWindow:     req.ActiveWindow,
		runningProcesses: req.RunningProcesses,
		osInfo:           req.OSInfo,
		ipAddress:        clientIP,
		lastPingAt:       time.Now().UTC(),
	}:
	default:
		if b.log != nil {
			b.log.Warn("telemetry batcher queue full, dropping ping", "user_id", userID)
		}
	}
}

func (b *Batcher) worker() {
	defer b.wg.Done()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	var batch []heartbeatItem

	for {
		select {
		case <-b.ctx.Done():
			b.flush(batch)
			return
		case item := <-b.ch:
			batch = append(batch, item)
			if len(batch) >= 100 {
				b.flush(batch)
				batch = nil
			}
		case <-ticker.C:
			if len(batch) > 0 {
				b.flush(batch)
				batch = nil
			}
		}
	}
}

func (b *Batcher) flush(items []heartbeatItem) {
	if len(items) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tx, err := b.pool.Begin(ctx)
	if err != nil {
		if b.log != nil {
			b.log.Error("failed to begin telemetry batch transaction", "error", err)
		}
		return
	}
	defer tx.Rollback(ctx)

	stmt := `
		INSERT INTO telemetry_heartbeats (user_id, team_id, active_window, running_processes, os_info, ip_address, last_ping_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (user_id) DO UPDATE
		SET team_id = EXCLUDED.team_id,
		    active_window = EXCLUDED.active_window,
		    running_processes = EXCLUDED.running_processes,
		    os_info = EXCLUDED.os_info,
		    ip_address = EXCLUDED.ip_address,
		    last_ping_at = EXCLUDED.last_ping_at;
	`

	for _, item := range items {
		_, err := tx.Exec(ctx, stmt,
			item.userID, item.teamID, item.activeWindow, item.runningProcesses, item.osInfo, item.ipAddress, item.lastPingAt,
		)
		if err != nil && b.log != nil {
			b.log.Error("failed to insert telemetry heartbeat in batch", "user_id", item.userID, "error", err)
		}
	}

	if err := tx.Commit(ctx); err != nil && b.log != nil {
		b.log.Error("failed to commit telemetry batch transaction", "error", err)
	}
}

func (b *Batcher) Stop() {
	b.cancel()
	b.wg.Wait()
}
