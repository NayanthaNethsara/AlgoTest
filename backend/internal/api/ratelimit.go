package api

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

type entry struct {
	limiter *rate.Limiter
	seen    time.Time
}

type LimiterStore struct {
	mu       sync.Mutex
	limiters map[string]*entry
	r        rate.Limit
	b        int
}

// idleEviction must exceed the time a full bucket takes to refill, or dropping a
// limiter would hand back an unspent burst.
const idleEviction = 15 * time.Minute

func NewLimiterStore(r rate.Limit, b int) *LimiterStore {
	store := &LimiterStore{
		limiters: make(map[string]*entry),
		r:        r,
		b:        b,
	}
	go func() {
		for {
			time.Sleep(idleEviction)
			store.evictIdle(time.Now())
		}
	}()
	return store
}

func (s *LimiterStore) Get(key string) *rate.Limiter {
	s.mu.Lock()
	defer s.mu.Unlock()

	e, exists := s.limiters[key]
	if !exists {
		e = &entry{limiter: rate.NewLimiter(s.r, s.b)}
		s.limiters[key] = e
	}
	e.seen = time.Now()
	return e.limiter
}

func (s *LimiterStore) evictIdle(now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for key, e := range s.limiters {
		if now.Sub(e.seen) >= idleEviction {
			delete(s.limiters, key)
		}
	}
}

var (
	// A whole hall shares this key, since they all reach the API through one portal.
	// The per-username limit below is what bounds a brute-force attempt.
	loginIPLimiter          = NewLimiterStore(rate.Every(100*time.Millisecond), 300) // 600 req/min/IP
	loginUserLimiter        = NewLimiterStore(rate.Every(12*time.Second), 5)         // 5 req/min/user
	runLimiter              = NewLimiterStore(rate.Every(5*time.Second), 12)         // 12 req/min/user
	submissionLimiter       = NewLimiterStore(rate.Every(6*time.Second), 10)         // 10 req/min/user
	submissionStatusLimiter = NewLimiterStore(rate.Every(1*time.Second), 60)         // 60 req/min/user
	adminLimiter            = NewLimiterStore(rate.Every(500*time.Millisecond), 120) // 120 req/min/admin

	readLimiter = NewLimiterStore(rate.Every(500*time.Millisecond), 90) // 120 req/min/user

	// Opens, not reads: an established stream is never charged again.
	streamLimiter = NewLimiterStore(rate.Every(5*time.Second), 12) // 12 opens/min/user

	// Keyed on the peer, so everyone behind a relay shares one bucket.
	healthLimiter   = NewLimiterStore(rate.Every(200*time.Millisecond), 60)  // 300 req/min/peer
	enrollIPLimiter = NewLimiterStore(rate.Every(200*time.Millisecond), 300) // 300 req/min/peer

	// The agent heartbeats every 15s (4/min). The headroom absorbs a reconnect
	// burst without letting a rogue client flood the ingest path.
	agentHeartbeatLimiter = NewLimiterStore(rate.Every(5*time.Second), 12) // 12 req/min/agent
	agentEventsLimiter    = NewLimiterStore(rate.Every(30*time.Second), 4) // 2 req/min/agent
	proctorSelfLimiter    = NewLimiterStore(rate.Every(3*time.Second), 20) // 20 req/min/user

	// Login bcrypt concurrency semaphore (capacity 8)
	loginSemaphore = make(chan struct{}, 8)
)

func rateLimitMiddleware(store *LimiterStore, keyFunc func(c *gin.Context) string) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := keyFunc(c)
		if key == "" {
			key = c.ClientIP()
		}
		if key != "" {
			limiter := store.Get(key)
			if !limiter.Allow() {
				c.JSON(http.StatusTooManyRequests, gin.H{
					"error": "Rate limit exceeded. Please slow down your requests.",
				})
				c.Abort()
				return
			}
		}
		c.Next()
	}
}

func maxBodySizeMiddleware(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		c.Next()
	}
}
