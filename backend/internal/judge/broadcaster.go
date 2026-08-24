package judge

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const JudgeVerdictsChannel = "judge_verdicts"

type Broadcaster struct {
	mu          sync.RWMutex
	subscribers map[chan Result]string
	pool        *pgxpool.Pool
	log         *slog.Logger
}

func NewBroadcaster(pool *pgxpool.Pool, log *slog.Logger) *Broadcaster {
	return &Broadcaster{
		subscribers: make(map[chan Result]string),
		pool:        pool,
		log:         log,
	}
}

func (b *Broadcaster) SetPool(pool *pgxpool.Pool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.pool = pool
}

// Subscribe adds a subscriber channel filtered by userID (if empty, receives all).
func (b *Broadcaster) Subscribe(userID string) (chan Result, func()) {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch := make(chan Result, 50)
	b.subscribers[ch] = userID

	unsubscribe := func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		delete(b.subscribers, ch)
		close(ch)
	}

	return ch, unsubscribe
}

// BroadcastLocal dispatches a Result directly to local in-memory subscribers.
func (b *Broadcaster) BroadcastLocal(res Result) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for ch, subUserID := range b.subscribers {
		if subUserID != "" && res.UserID != "" && res.UserID != subUserID {
			continue
		}

		select {
		case ch <- res:
		default:
		}
	}
}

// Broadcast sends the Result to local subscribers and publishes via PostgreSQL LISTEN/NOTIFY.
func (b *Broadcaster) Broadcast(res Result) {
	b.mu.RLock()
	pool := b.pool
	b.mu.RUnlock()

	if pool == nil {
		b.BroadcastLocal(res)
		return
	}

	payload, err := json.Marshal(res)
	if err != nil {
		b.BroadcastLocal(res)
		return
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_, _ = pool.Exec(ctx, "SELECT pg_notify($1, $2)", JudgeVerdictsChannel, string(payload))
	}()

	b.BroadcastLocal(res)
}

// StartListener listens on the PostgreSQL notify channel and routes external worker events to local subscribers.
func (b *Broadcaster) StartListener(ctx context.Context) {
	b.mu.RLock()
	pool := b.pool
	log := b.log
	b.mu.RUnlock()

	if pool == nil {
		return
	}

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			conn, err := pool.Acquire(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				if log != nil {
					log.Error("failed to acquire connection for judge listener", "error", err)
				}
				time.Sleep(2 * time.Second)
				continue
			}

			_, err = conn.Exec(ctx, "LISTEN "+JudgeVerdictsChannel)
			if err != nil {
				conn.Release()
				if ctx.Err() != nil {
					return
				}
				if log != nil {
					log.Error("failed to listen on judge channel", "error", err)
				}
				time.Sleep(2 * time.Second)
				continue
			}

			for {
				notification, err := conn.Conn().WaitForNotification(ctx)
				if err != nil {
					conn.Release()
					break
				}

				var res Result
				if err := json.Unmarshal([]byte(notification.Payload), &res); err == nil {
					b.BroadcastLocal(res)
				}
			}
		}
	}()
}
