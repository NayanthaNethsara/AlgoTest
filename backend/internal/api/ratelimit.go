package api

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

type LimiterStore struct {
	mu       sync.Mutex
	limiters map[string]*rate.Limiter
	r        rate.Limit
	b        int
}

func NewLimiterStore(r rate.Limit, b int) *LimiterStore {
	store := &LimiterStore{
		limiters: make(map[string]*rate.Limiter),
		r:        r,
		b:        b,
	}
	// Cleanup stale limiters periodically
	go func() {
		for {
			time.Sleep(10 * time.Minute)
			store.mu.Lock()
			store.limiters = make(map[string]*rate.Limiter)
			store.mu.Unlock()
		}
	}()
	return store
}

func (s *LimiterStore) Get(key string) *rate.Limiter {
	s.mu.Lock()
	defer s.mu.Unlock()

	limiter, exists := s.limiters[key]
	if !exists {
		limiter = rate.NewLimiter(s.r, s.b)
		s.limiters[key] = limiter
	}
	return limiter
}

var (
	// Rate limiters
	loginIPLimiter          = NewLimiterStore(rate.Every(6*time.Second), 10)  // 10 req/min/IP
	loginUserLimiter        = NewLimiterStore(rate.Every(12*time.Second), 5)  // 5 req/min/user
	runLimiter              = NewLimiterStore(rate.Every(5*time.Second), 12)  // 12 req/min/user
	submissionLimiter       = NewLimiterStore(rate.Every(6*time.Second), 10)  // 10 req/min/user
	submissionStatusLimiter = NewLimiterStore(rate.Every(1*time.Second), 60)  // 60 req/min/user
	telemetryPingLimiter    = NewLimiterStore(rate.Every(7500*time.Millisecond), 8) // 8 req/min/user
	adminLimiter            = NewLimiterStore(rate.Every(500*time.Millisecond), 120) // 120 req/min/admin

	// The agent heartbeats every 15s (4/min). The headroom absorbs a reconnect
	// burst without letting a rogue client flood the ingest path.
	agentHeartbeatLimiter = NewLimiterStore(rate.Every(5*time.Second), 12)  // 12 req/min/agent
	agentEventsLimiter    = NewLimiterStore(rate.Every(30*time.Second), 4)  // 2 req/min/agent
	proctorSelfLimiter    = NewLimiterStore(rate.Every(3*time.Second), 20)  // 20 req/min/user

	// Login bcrypt concurrency semaphore (capacity 8)
	loginSemaphore = make(chan struct{}, 8)
)

func rateLimitMiddleware(store *LimiterStore, keyFunc func(c *gin.Context) string) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := keyFunc(c)
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
