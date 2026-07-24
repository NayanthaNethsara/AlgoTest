package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/auth"
)

const contextUserKey = "user"

type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// login verifies credentials, creates a server-side session, and returns the
// opaque token for the caller (Next.js) to store as an HTTP-only cookie.
func (h *handler) login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	u, hash, err := h.users.GetForLogin(ctx, req.Username)
	if err != nil {
		// Spend the same time as a real bcrypt check so response timing can't
		// distinguish "no such user" from "wrong password".
		auth.DummyCompare(req.Password)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}
	if !auth.CheckPassword(hash, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}

	token, err := auth.NewSessionToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}

	expiresAt := time.Now().Add(h.cfg.SessionTTL())
	if err := h.sessions.Create(ctx, token, u.ID, expiresAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}
	_ = h.users.TouchLastLogin(ctx, u.ID)

	c.JSON(http.StatusOK, gin.H{
		"sessionToken":     token,
		"expiresInSeconds": int(h.cfg.SessionTTL().Seconds()),
		"user":             u,
	})
}

// logout deletes the server-side session so the cookie can't be reused.
func (h *handler) logout(c *gin.Context) {
	if token, err := c.Cookie(h.cfg.SessionCookieName); err == nil && token != "" {
		_ = h.sessions.Delete(c.Request.Context(), token)
	}
	c.Status(http.StatusNoContent)
}

func (h *handler) me(c *gin.Context) {
	c.JSON(http.StatusOK, c.MustGet(contextUserKey))
}

// requireUser validates the session cookie and loads the user into the context.
func (h *handler) requireUser(c *gin.Context) {
	token, err := c.Cookie(h.cfg.SessionCookieName)
	if err != nil || token == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthenticated"})
		return
	}

	ctx := c.Request.Context()
	s, err := h.sessions.Get(ctx, token)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid session"})
		return
	}
	if time.Now().After(s.ExpiresAt) {
		_ = h.sessions.Delete(ctx, token)
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "session expired"})
		return
	}

	u, err := h.users.GetByID(ctx, s.UserID)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}

	c.Set(contextUserKey, u)
	c.Next()
}
