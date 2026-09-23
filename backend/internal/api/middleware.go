package api

import (
	"compress/gzip"
	"context"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/NayanthaNethsara/labyrithm/backend/internal/agent"
	"github.com/NayanthaNethsara/labyrithm/backend/internal/contest"
	"github.com/NayanthaNethsara/labyrithm/backend/internal/user"
	"github.com/gin-contrib/cors"
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

func (s *LimiterStore) Delete(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.limiters, key)
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
	loginIPLimiter          = NewLimiterStore(rate.Every(100*time.Millisecond), 300) // 600 req/min/IP
	loginUserLimiter        = NewLimiterStore(rate.Every(2*time.Second), 25)         // 30 req/min/user, burst 25
	runLimiter              = NewLimiterStore(rate.Every(5*time.Second), 12)         // 12 req/min/user
	submissionLimiter       = NewLimiterStore(rate.Every(6*time.Second), 10)         // 10 req/min/user
	submissionStatusLimiter = NewLimiterStore(rate.Every(1*time.Second), 60)         // 60 req/min/user
	adminLimiter            = NewLimiterStore(rate.Every(500*time.Millisecond), 120) // 120 req/min/admin
	readLimiter             = NewLimiterStore(rate.Every(250*time.Millisecond), 180) // 240 req/min/user; shared by page reads
	streamLimiter           = NewLimiterStore(rate.Every(2*time.Second), 25)         // 30 opens/min/user, burst 25
	healthLimiter           = NewLimiterStore(rate.Every(200*time.Millisecond), 60)  // 300 req/min/peer
	enrollIPLimiter         = NewLimiterStore(rate.Every(200*time.Millisecond), 300) // 300 req/min/peer
	agentHeartbeatLimiter   = NewLimiterStore(rate.Every(5*time.Second), 12)         // 12 req/min/agent
	agentEventsLimiter      = NewLimiterStore(rate.Every(30*time.Second), 4)         // 2 req/min/agent
	proctorSelfLimiter      = NewLimiterStore(rate.Every(1500*time.Millisecond), 40) // 40 req/min/user

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

func requestDecompressMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetHeader("Content-Encoding") == "gzip" {
			reader, err := gzip.NewReader(c.Request.Body)
			if err == nil {
				defer reader.Close()
				c.Request.Body = io.NopCloser(reader)
			}
		}
		c.Next()
	}
}

func userIDKeyFunc(c *gin.Context) string {
	u, exists := c.Get(contextUserKey)
	if !exists {
		return ""
	}
	if usr, ok := u.(user.User); ok {
		return usr.ID
	}
	return ""
}

func peerIPKeyFunc(c *gin.Context) string {
	return c.RemoteIP()
}

func agentIDKeyFunc(c *gin.Context) string {
	a, exists := c.Get(contextAgentKey)
	if !exists {
		return ""
	}
	if ag, ok := a.(agent.Agent); ok {
		return ag.ID
	}
	return ""
}

func isTauriOrigin(origin string) bool {
	return origin == "tauri://localhost" ||
		strings.HasPrefix(origin, "tauri://") ||
		origin == "http://tauri.localhost" ||
		origin == "https://tauri.localhost"
}

func corsMiddleware(origins []string) gin.HandlerFunc {
	allowedMap := make(map[string]bool, len(origins))
	for _, o := range origins {
		trimmed := strings.TrimSpace(o)
		if trimmed != "" && trimmed != "*" {
			allowedMap[trimmed] = true
		}
	}

	c := cors.Config{
		AllowOriginFunc: func(origin string) bool {
			if isTauriOrigin(origin) {
				return true
			}
			return allowedMap[origin]
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Requested-With", attestHeader, clientHeader},
		AllowCredentials: true,
	}
	return cors.New(c)
}

func requireContestActiveMiddleware(cm *contest.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := currentUser(c)
		if u.Role == user.RoleAdmin {
			c.Next()
			return
		}

		if cm == nil {
			c.Next()
			return
		}

		state := cm.GetState()
		switch state.Status {
		case contest.StatusNotStarted:
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "contest has not started yet; challenges and execution are locked",
				"code":  "CONTEST_NOT_STARTED",
			})
			return
		case contest.StatusPaused:
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "contest is currently paused",
				"code":  "CONTEST_PAUSED",
			})
			return
		}

		c.Next()
	}
}

func requireContestSubmissionsAllowedMiddleware(cm *contest.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := currentUser(c)
		if u.Role == user.RoleAdmin {
			c.Next()
			return
		}

		if cm == nil {
			c.Next()
			return
		}

		state := cm.GetState()
		switch state.Status {
		case contest.StatusNotStarted:
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "contest has not started yet",
				"code":  "CONTEST_NOT_STARTED",
			})
			return
		case contest.StatusPaused:
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "contest is currently paused",
				"code":  "CONTEST_PAUSED",
			})
			return
		case contest.StatusEnded:
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "contest has ended; submissions are closed",
				"code":  "CONTEST_ENDED",
			})
			return
		}

		c.Next()
	}
}

const (
	attestHeader  = "X-Proctor-Attest"
	clientHeader  = "X-Proctor-Client"
	desktopCookie = "labyrithm-client"
)

func portalAttestNonce(c *gin.Context) string {
	return strings.TrimSpace(c.GetHeader(attestHeader))
}

func portalClaimsDesktop(c *gin.Context) bool {
	if strings.ToLower(strings.TrimSpace(c.GetHeader(clientHeader))) == "desktop" {
		return true
	}
	if cookie, err := c.Cookie(desktopCookie); err == nil && strings.ToLower(strings.TrimSpace(cookie)) == "desktop" {
		return true
	}
	return false
}

func portalClientIP(c *gin.Context) (string, bool) {
	ipStr := c.ClientIP()
	if ipStr == "" {
		return "", false
	}
	return ipStr, true
}

type gateStatusFunc func(ctx context.Context, userID string, claimsDesktop bool) (agent.Decision, error)

func lockResponse(d agent.Decision) gin.H {
	return gin.H{
		"error":              d.Remedy,
		"code":               d.Code,
		"last_ping_at":       d.LastSeenAt,
		"seconds_since_ping": d.SecondsSincePing,
		"access_mode":        d.AccessMode,
		"allowed_modes":      d.AllowedModes,
	}
}

func requireProctorAccess(status gateStatusFunc, log *slog.Logger, bypass ...bool) gin.HandlerFunc {
	isBypassed := len(bypass) > 0 && bypass[0]
	return func(c *gin.Context) {
		if isBypassed {
			c.Next()
			return
		}
		u := currentUser(c)

		d, err := status(c.Request.Context(), u.ID, portalClaimsDesktop(c))
		if err != nil {
			if log != nil {
				log.Error("proctor access check failed", "user_id", u.ID, "error", err)
			}
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"error": "Could not verify proctoring status. Retry in a moment.",
				"code":  "GATE_UNAVAILABLE",
			})
			return
		}

		if !d.Allowed {
			c.AbortWithStatusJSON(http.StatusLocked, lockResponse(d))
			return
		}

		c.Next()
	}
}
