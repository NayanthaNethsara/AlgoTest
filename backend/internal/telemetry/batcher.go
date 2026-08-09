package telemetry

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Batcher absorbs heartbeat writes so 500 agents pinging every 15s cost the
// request path nothing. Heartbeats are last-write-wins per user, and the whole
// queue is droppable: proctoring must never stall the contest.
type Batcher struct {
	pool   *pgxpool.Pool
	agents chan AgentRow
	webs   chan WebRow
	log    *slog.Logger
	wg     sync.WaitGroup
	ctx    context.Context
	cancel context.CancelFunc
}

func NewBatcher(pool *pgxpool.Pool, log *slog.Logger) *Batcher {
	ctx, cancel := context.WithCancel(context.Background())
	b := &Batcher{
		pool:   pool,
		agents: make(chan AgentRow, 5000),
		webs:   make(chan WebRow, 2000),
		log:    log,
		ctx:    ctx,
		cancel: cancel,
	}
	b.wg.Add(1)
	go b.worker()
	return b
}

func (b *Batcher) EnqueueAgent(row AgentRow) {
	select {
	case b.agents <- row:
	default:
		if b.log != nil {
			b.log.Warn("telemetry batcher queue full, dropping agent heartbeat", "user_id", row.UserID)
		}
	}
}

func (b *Batcher) EnqueueWeb(row WebRow) {
	select {
	case b.webs <- row:
	default:
		if b.log != nil {
			b.log.Warn("telemetry batcher queue full, dropping web ping", "user_id", row.UserID)
		}
	}
}

func (b *Batcher) worker() {
	defer b.wg.Done()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	agentBatch := map[string]AgentRow{}
	webBatch := map[string]WebRow{}

	for {
		select {
		case <-b.ctx.Done():
			b.flush(agentBatch, webBatch)
			return
		case row := <-b.agents:
			agentBatch[row.UserID] = row
			if len(agentBatch) >= 200 {
				b.flush(agentBatch, webBatch)
				agentBatch, webBatch = map[string]AgentRow{}, map[string]WebRow{}
			}
		case row := <-b.webs:
			webBatch[row.UserID] = row
		case <-ticker.C:
			if len(agentBatch) > 0 || len(webBatch) > 0 {
				b.flush(agentBatch, webBatch)
				agentBatch, webBatch = map[string]AgentRow{}, map[string]WebRow{}
			}
		}
	}
}

func (b *Batcher) flush(agentBatch map[string]AgentRow, webBatch map[string]WebRow) {
	if len(agentBatch) == 0 && len(webBatch) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tx, err := b.pool.Begin(ctx)
	if err != nil {
		b.logError("failed to begin telemetry batch transaction", err)
		return
	}
	defer tx.Rollback(ctx)

	// A heartbeat is not worth an fsync; losing the last 2s of liveness data on
	// a crash is immaterial and this turns 33 commits/s into 0.5.
	if _, err := tx.Exec(ctx, `SET LOCAL synchronous_commit = off;`); err != nil {
		b.logError("failed to relax synchronous_commit for telemetry batch", err)
	}

	for _, row := range agentBatch {
		dwell, err := json.Marshal(row.ForegroundDwell)
		if err != nil || row.ForegroundDwell == nil {
			dwell = []byte("{}")
		}
		ports := row.Ports
		if len(ports) == 0 {
			ports = []byte("[]")
		}
		matches := row.ProcessMatches
		if matches == nil {
			matches = []string{}
		}

		var agentID any
		if row.AgentID != "" {
			agentID = row.AgentID
		}
		var bootID any
		if row.BootID != "" {
			bootID = row.BootID
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO telemetry_heartbeats (
				user_id, team_id, agent_id, agent_version, active_window, running_processes,
				os_info, ip_address, boot_id, seq, signal_hash, shell_alive,
				internet_reachable, lan_ip, foreground_dwell, ports, last_ping_at
			) VALUES ($1, (SELECT team_id FROM users WHERE id = $1), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
			ON CONFLICT (user_id) DO UPDATE SET
				team_id            = EXCLUDED.team_id,
				agent_id           = EXCLUDED.agent_id,
				agent_version      = EXCLUDED.agent_version,
				active_window      = EXCLUDED.active_window,
				running_processes  = EXCLUDED.running_processes,
				os_info            = EXCLUDED.os_info,
				ip_address         = EXCLUDED.ip_address,
				boot_id            = EXCLUDED.boot_id,
				seq                = GREATEST(telemetry_heartbeats.seq, EXCLUDED.seq),
				signal_hash        = EXCLUDED.signal_hash,
				shell_alive        = EXCLUDED.shell_alive,
				internet_reachable = EXCLUDED.internet_reachable,
				lan_ip             = EXCLUDED.lan_ip,
				foreground_dwell   = EXCLUDED.foreground_dwell,
				ports              = EXCLUDED.ports,
				last_ping_at       = GREATEST(telemetry_heartbeats.last_ping_at, EXCLUDED.last_ping_at);
		`,
			row.UserID, agentID, row.AgentVersion, row.ActiveWindow, matches,
			row.OSInfo, row.IPAddress, bootID, row.Seq, row.SignalHash, row.ShellAlive,
			row.InternetReachable, row.LanIP, dwell, ports, row.LastPingAt,
		); err != nil {
			b.logError("failed to write agent heartbeat", err)
		}
	}

	for _, row := range webBatch {
		if _, err := tx.Exec(ctx, `
			INSERT INTO telemetry_heartbeats (user_id, team_id, web_last_ping_at, web_ip, web_user_agent)
			VALUES ($1, (SELECT team_id FROM users WHERE id = $1), now(), $2, $3)
			ON CONFLICT (user_id) DO UPDATE SET
				team_id          = EXCLUDED.team_id,
				web_last_ping_at = now(),
				web_ip           = EXCLUDED.web_ip,
				web_user_agent   = EXCLUDED.web_user_agent;
		`, row.UserID, row.IPAddress, row.UserAgent); err != nil {
			b.logError("failed to write web ping", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		b.logError("failed to commit telemetry batch transaction", err)
	}
}

func (b *Batcher) logError(msg string, err error) {
	if b.log != nil {
		b.log.Error(msg, "error", err)
	}
}

func (b *Batcher) Stop() {
	b.cancel()
	b.wg.Wait()
}
