package api

import (
	"fmt"
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
// @Failure 403 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/auth/login [post]
func (h *handler) login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	normalizedUsername := strings.ToLower(strings.TrimSpace(req.Username))

	if isLocked, remaining := loginAttemptTracker.IsLocked(normalizedUsername); isLocked {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": fmt.Sprintf("Account temporarily locked due to too many failed attempts. Try again in %d minutes.", int(remaining.Minutes())+1),
		})
		return
	}

	ctx := c.Request.Context()

	ip := c.ClientIP()
	if !loginIPLimiter.Get(ip).Allow() || !loginUserLimiter.Get(normalizedUsername).Allow() {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many login attempts. Please wait a moment."})
		return
	}

	loginSemaphore <- struct{}{}
	defer func() { <-loginSemaphore }()

	u, hash, err := h.users.GetForLogin(ctx, req.Username)
	if err != nil {
		loginAttemptTracker.RecordFailure(normalizedUsername)
		auth.DummyCompare(req.Password)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}
	if !auth.CheckPassword(hash, req.Password) {
		loginAttemptTracker.RecordFailure(normalizedUsername)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}

	loginAttemptTracker.RecordSuccess(normalizedUsername)

	if u.IsSuspended {
		msg := "Account has been suspended by an administrator."
		if u.SuspendedReason != "" {
			msg += " Reason: " + u.SuspendedReason
		}
		c.JSON(http.StatusForbidden, gin.H{"error": msg})
		return
	}

	token, err := auth.NewSessionToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}

	sessionTTL := h.cfg.SessionTTL()
	if u.Role == user.RoleAdmin {
		sessionTTL = h.cfg.AdminSessionTTL()
	}

	expiresAt := time.Now().Add(sessionTTL)
	shouldRevokePriorSessions := u.Role != user.RoleAdmin
	if err := h.sessions.Create(ctx, token, u.ID, expiresAt, shouldRevokePriorSessions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}
	if err := h.users.TouchLastLogin(ctx, u.ID); err != nil {
		log.Printf("failed to touch last login for user %s: %v", u.ID, err)
	}

	c.JSON(http.StatusOK, loginResponse{
		SessionToken:     token,
		ExpiresInSeconds: int(sessionTTL.Seconds()),
		User:             u,
	})
}

func (h *handler) extractSessionToken(c *gin.Context) string {
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}
	if cookieToken, err := c.Cookie(h.cfg.SessionCookieName); err == nil && cookieToken != "" {
		return cookieToken
	}
	return ""
}

// @Summary User Logout
// @Description Delete current server-side session token.
// @Tags Auth
// @Security BearerAuth
// @Success 244 "No Content"
// @Router /api/v1/auth/logout [post]
func (h *handler) logout(c *gin.Context) {
	if token := h.extractSessionToken(c); token != "" {
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

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" binding:"required"`
	NewPassword     string `json:"newPassword" binding:"required"`
}

// @Summary Change Password
// @Description Update user's own password after verifying current credentials.
// @Tags Auth
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param payload body changePasswordRequest true "Change Password Payload"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/me/password [post]
func (h *handler) changePassword(c *gin.Context) {
	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	usr := currentUser(c)

	minPasswordLength := 8
	if usr.Role == user.RoleAdmin {
		minPasswordLength = 12
	}

	if len(req.NewPassword) < minPasswordLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("new password must be at least %d characters", minPasswordLength)})
		return
	}

	if strings.EqualFold(strings.TrimSpace(req.NewPassword), usr.Username) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password cannot match username"})
		return
	}

	ctx := c.Request.Context()

	_, hash, err := h.users.GetForLogin(ctx, usr.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user credentials"})
		return
	}

	if !auth.CheckPassword(hash, req.CurrentPassword) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "current password is incorrect"})
		return
	}

	newHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash new password"})
		return
	}

	if err := h.users.UpdatePassword(ctx, usr.ID, newHash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
		return
	}

	if err := h.sessions.DeleteByUser(ctx, usr.ID); err != nil {
		log.Printf("failed to revoke sessions on password update for user %s: %v", usr.ID, err)
	}

	c.JSON(http.StatusOK, gin.H{"status": "password updated"})
}

// requireUser validates the session cookie and loads the user into the context.
func (h *handler) requireUser(c *gin.Context) {
	token := h.extractSessionToken(c)
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

	if u.IsSuspended {
		_ = h.sessions.Delete(ctx, token)
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Account has been suspended by an administrator."})
		return
	}

	c.Set(contextUserKey, u)
	c.Next()
}
