package judge

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

const JudgeVerdictsChannel = "judge_verdicts"

type broadcastEnvelope struct {
	SourceID string `json:"source_id"`
	Result   Result `json:"result"`
}

type Broadcaster struct {
	instanceID  string
	mu          sync.RWMutex
	subscribers map[chan Result]string
	pool        *pgxpool.Pool
	log         *slog.Logger
}

func NewBroadcaster(pool *pgxpool.Pool, log *slog.Logger) *Broadcaster {
	return &Broadcaster{
		instanceID:  uuid.NewString(),
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

	ch := make(chan Result, 500)
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

	isTerminal := res.Status == StatusPassed || res.Status == StatusFailed

	for ch, subUserID := range b.subscribers {
		if subUserID != "" && res.UserID != "" && res.UserID != subUserID {
			continue
		}

		select {
		case ch <- res:
		default:
			if isTerminal {
				select {
				case <-ch:
				default:
				}
				select {
				case ch <- res:
				default:
				}
			}
		}
	}
}

// Broadcast sends the Result to local subscribers and publishes via PostgreSQL LISTEN/NOTIFY.
func (b *Broadcaster) Broadcast(res Result) {
	b.mu.RLock()
	pool := b.pool
	b.mu.RUnlock()

	// Dispatch to local memory subscribers immediately
	b.BroadcastLocal(res)

	if pool == nil {
		return
	}

	env := broadcastEnvelope{
		SourceID: b.instanceID,
		Result:   res,
	}

	payload, err := json.Marshal(env)
	if err != nil {
		return
	}

	// Postgres NOTIFY payload limit is 8000 bytes. If payload exceeds 7500 bytes,
	// strip detailed test case items to prevent PostgreSQL query rejection.
	if len(payload) > 7500 {
		stripped := res
		stripped.Tests = nil
		env.Result = stripped
		payload, err = json.Marshal(env)
		if err != nil {
			return
		}
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if _, err := pool.Exec(ctx, "SELECT pg_notify($1, $2)", JudgeVerdictsChannel, string(payload)); err != nil {
			b.mu.RLock()
			log := b.log
			b.mu.RUnlock()
			if log != nil {
				log.Error("failed to broadcast judge verdict via pg_notify", "error", err, "submission_id", res.SubmissionID)
			}
		}
	}()
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

				// If the notification carries an envelope, check source instance
				var env broadcastEnvelope
				if err := json.Unmarshal([]byte(notification.Payload), &env); err == nil && env.Result.SubmissionID != "" {
					if env.SourceID != "" && env.SourceID == b.instanceID {
						// Originated from this instance; already broadcast locally
						continue
					}

					// Hydrate tests if stripped due to NOTIFY size limit
					if len(env.Result.Tests) == 0 && (env.Result.Status == StatusPassed || env.Result.Status == StatusFailed) {
						qCtx, qCancel := context.WithTimeout(ctx, 2*time.Second)
						if fullRes, found, _ := (&Repository{pool: pool}).GetSubmission(qCtx, env.Result.SubmissionID); found && fullRes != nil {
							env.Result.Tests = fullRes.Tests
						}
						qCancel()
					}

					b.BroadcastLocal(env.Result)
					continue
				}

				// Fallback for legacy raw Result notifications
				var res Result
				if err := json.Unmarshal([]byte(notification.Payload), &res); err == nil && res.SubmissionID != "" {
					b.BroadcastLocal(res)
				}
			}
		}
	}()
}
