package api

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/auth"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

const contextUserKey = "user"

type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type loginResponse struct {
	SessionToken     string    `json:"sessionToken"`
	ExpiresInSeconds int       `json:"expiresInSeconds"`
	User             user.User `json:"user"`
}

// @Summary User Login
// @Description Authenticate user with username and password, creating a server-side session.
// @Tags Auth
// @Accept json
// @Produce json
// @Param credentials body loginRequest true "Login Credentials"
// @Success 200 {object} loginResponse
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/auth/login [post]
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
	if err := h.users.TouchLastLogin(ctx, u.ID); err != nil {
		log.Printf("failed to touch last login for user %s: %v", u.ID, err)
	}

	c.JSON(http.StatusOK, loginResponse{
		SessionToken:     token,
		ExpiresInSeconds: int(h.cfg.SessionTTL().Seconds()),
		User:             u,
	})
}

// @Summary User Logout
// @Description Delete current server-side session token.
// @Tags Auth
// @Security BearerAuth
// @Success 244 "No Content"
// @Router /api/v1/auth/logout [post]
func (h *handler) logout(c *gin.Context) {
	if token, err := c.Cookie(h.cfg.SessionCookieName); err == nil && token != "" {
		if err := h.sessions.Delete(c.Request.Context(), token); err != nil {
			log.Printf("failed to delete session during logout: %v", err)
		}
	}
	c.Status(http.StatusNoContent)
}

// @Summary Get Current User Profile
// @Description Fetch authenticated user profile details and team info.
// @Tags Auth
// @Produce json
// @Security BearerAuth
// @Success 200 {object} user.User
// @Failure 401 {object} map[string]string
// @Router /api/v1/me [get]
func (h *handler) me(c *gin.Context) {
	c.JSON(http.StatusOK, c.MustGet(contextUserKey))
}

// requireUser validates the session cookie and loads the user into the context.
func (h *handler) requireUser(c *gin.Context) {
	var token string
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token = strings.TrimPrefix(authHeader, "Bearer ")
	}
	if token == "" {
		if cookieToken, err := c.Cookie(h.cfg.SessionCookieName); err == nil {
			token = cookieToken
		}
	}
	if token == "" {
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
		if err := h.sessions.Delete(ctx, token); err != nil {
			log.Printf("failed to delete expired session: %v", err)
		}
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
