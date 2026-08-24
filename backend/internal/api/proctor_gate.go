package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
	"github.com/gin-gonic/gin"
)

const (
	attestHeader = "X-Proctor-Attest"
	clientHeader = "X-Proctor-Client"
)

func portalClaimsDesktop(c *gin.Context) bool {
	return strings.ToLower(strings.TrimSpace(c.GetHeader(clientHeader))) == "desktop"
}

func portalClientIP(c *gin.Context) (string, bool) {
	ipStr := c.ClientIP()
	if ipStr == "" {
		return "", false
	}
	return ipStr, true
}

// gateStatusFunc is the gate's read-only verdict for one contestant. Taken as a
// function rather than the Gate itself so the middleware can be exercised without a
// database, and so a nil gate is impossible to pass by accident.
type gateStatusFunc func(ctx context.Context, userID string, claimsDesktop bool) (agent.Decision, error)

// lockResponse is the refusal body. Deliberately identical in shape to the one
// POST /submissions returns, so the portal has one lock to understand rather than
// two that drift apart.
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

// requireProctorAccess withholds the contest itself, not just the ability to score.
//
// The portal already refuses to render a problem to a locked contestant, but that is
// a rendering decision in code the contestant runs; the statement is one curl away
// from anyone holding a session cookie. Enforcing here is what makes "you cannot work
// on this unproctored" true rather than merely displayed.
//
// It reads the gate through Status, not Check: Check writes a finding per call, and
// risk scales as weight × (1 + ln(occurrences)), so gating a route a contestant hits
// on every page load would inflate the risk score of anyone holding a browser grant
// for doing exactly what they were granted. Enforcement must not double as evidence.
func requireProctorAccess(status gateStatusFunc, log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		u := currentUser(c)

		d, err := status(c.Request.Context(), u.ID, portalClaimsDesktop(c))
		if err != nil {
			// Fails closed, and costs nothing to do so: the gate reads the same
			// database the problem statement comes from, so an error here means the
			// request behind it was going to fail anyway. Fleet-wide agent outages
			// are already forced open inside Decide, which is the case that actually
			// needed protecting.
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
