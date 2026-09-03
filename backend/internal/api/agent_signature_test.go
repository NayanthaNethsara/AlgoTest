package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
)

func TestRequireAgentSignature(t *testing.T) {
	gin.SetMode(gin.TestMode)

	rawToken := "test-agent-token-32-chars-length-1234"
	bodyBytes := []byte(`{"boot_id":"b1","seq":1}`)
	validSig := agent.ComputeHMAC([]byte(rawToken), bodyBytes)

	setupRouter := func(cfg config.Config) *gin.Engine {
		h := &handler{cfg: cfg}
		r := gin.New()
		r.POST("/test",
			func(c *gin.Context) {
				c.Set(contextAgentRawTokenKey, rawToken)
			},
			h.requireAgentSignature(),
			func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"status": "ok"})
			},
		)
		return r
	}

	t.Run("valid signature passes", func(t *testing.T) {
		r := setupRouter(config.Config{})
		req := httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(bodyBytes))
		req.Header.Set("X-Agent-Signature", validSig)
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
	})

	t.Run("missing signature fails", func(t *testing.T) {
		r := setupRouter(config.Config{})
		req := httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(bodyBytes))
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", w.Code)
		}
	})

	t.Run("tampered payload fails", func(t *testing.T) {
		r := setupRouter(config.Config{})
		tamperedBytes := []byte(`{"boot_id":"b1","seq":2}`)
		req := httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(tamperedBytes))
		req.Header.Set("X-Agent-Signature", validSig)
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", w.Code)
		}
	})

	t.Run("dev bypass allows unsigned requests", func(t *testing.T) {
		r := setupRouter(config.Config{Env: "development", DevBypassProctor: true})
		req := httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(bodyBytes))
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", w.Code)
		}
	})
}
