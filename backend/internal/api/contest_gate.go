package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/contest"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

// requireContestActiveMiddleware ensures the contest has started and is not paused
// before allowing code execution or viewing challenge details.
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
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "contest has not started yet; challenges and execution are locked"})
			return
		case contest.StatusPaused:
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "contest is currently paused"})
			return
		}

		c.Next()
	}
}

// requireContestSubmissionsAllowedMiddleware ensures submissions can only be made
// when the contest is actively running (rejects if NOT_STARTED, PAUSED, or ENDED).
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
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "contest has not started yet"})
			return
		case contest.StatusPaused:
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "contest is currently paused"})
			return
		case contest.StatusEnded:
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "contest has ended; submissions are closed"})
			return
		}

		c.Next()
	}
}
