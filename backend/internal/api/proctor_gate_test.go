package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

func gatedRouter(status gateStatusFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/problems",
		func(c *gin.Context) { c.Set(contextUserKey, user.User{ID: "u1", Username: "nayantha"}) },
		requireProctorAccess(status, nil),
		func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"statement": "secret"}) },
	)
	return r
}

func getProblems(t *testing.T, status gateStatusFunc) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	gatedRouter(status).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/problems", nil))
	return w
}

func TestProctorAccessWithholdsContentWhenLocked(t *testing.T) {
	w := getProblems(t, func(context.Context, string, bool) (agent.Decision, error) {
		return agent.Decision{
			Allowed:      false,
			Code:         agent.CodeAgentStopped,
			Remedy:       "Start the proctor client to submit again.",
			AccessMode:   agent.ModeWebOnly,
			AllowedModes: []agent.AccessMode{agent.ModeDesktopShell},
		}, nil
	})

	if w.Code != http.StatusLocked {
		t.Fatalf("status = %d, want 423", w.Code)
	}
	if body := w.Body.String(); strings.Contains(body, "secret") {
		t.Fatalf("locked response leaked the handler's body: %s", body)
	}

	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if got["code"] != agent.CodeAgentStopped {
		t.Errorf("code = %v, want %s", got["code"], agent.CodeAgentStopped)
	}
	if got["error"] == "" || got["error"] == nil {
		t.Error("refusal carried no remedy for the contestant to act on")
	}
}

func TestProctorAccessPassesWhenAllowed(t *testing.T) {
	w := getProblems(t, func(context.Context, string, bool) (agent.Decision, error) {
		return agent.Decision{Allowed: true, AccessMode: agent.ModeDesktopShell}, nil
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), "secret") {
		t.Error("allowed request did not reach the handler")
	}
}

// An exempt contestant is allowed by Decide itself, so the middleware must not
// second-guess it — the whole point of an exemption is that it survives every
// downstream check.
func TestProctorAccessHonoursExemption(t *testing.T) {
	w := getProblems(t, func(context.Context, string, bool) (agent.Decision, error) {
		return agent.Decision{Allowed: true, Exempt: true}, nil
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 for an exempt contestant", w.Code)
	}
}

func TestProctorAccessFailsClosedOnGateError(t *testing.T) {
	w := getProblems(t, func(context.Context, string, bool) (agent.Decision, error) {
		return agent.Decision{}, errors.New("connection refused")
	})

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
	if strings.Contains(w.Body.String(), "secret") {
		t.Fatal("an unevaluated gate served the content anyway")
	}
	if strings.Contains(w.Body.String(), "connection refused") {
		t.Error("internal error text was returned to the contestant")
	}
}

func TestPortalHeaderExtraction(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("extracts X-Proctor-Attest and X-Proctor-Client headers", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		req, _ := http.NewRequest(http.MethodPost, "/test", nil)
		req.Header.Set("X-Proctor-Attest", "nonce-12345")
		req.Header.Set("X-Proctor-Client", "desktop")
		c.Request = req

		if nonce := portalAttestNonce(c); nonce != "nonce-12345" {
			t.Errorf("portalAttestNonce() = %q, want %q", nonce, "nonce-12345")
		}
		if !portalClaimsDesktop(c) {
			t.Error("portalClaimsDesktop() should be true for header")
		}
	})

	t.Run("extracts desktop client claim from cookie", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		req, _ := http.NewRequest(http.MethodGet, "/test", nil)
		req.AddCookie(&http.Cookie{Name: "mini-algothon-client", Value: "desktop"})
		c.Request = req

		if !portalClaimsDesktop(c) {
			t.Error("portalClaimsDesktop() should be true for cookie")
		}
	})

	t.Run("handles missing or web headers", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		req, _ := http.NewRequest(http.MethodPost, "/test", nil)
		req.Header.Set("X-Proctor-Client", "web")
		c.Request = req

		if nonce := portalAttestNonce(c); nonce != "" {
			t.Errorf("portalAttestNonce() = %q, want empty", nonce)
		}
		if portalClaimsDesktop(c) {
			t.Error("portalClaimsDesktop() should be false for web client")
		}
	})
}

func TestProctorAccessBypassesWhenConfigured(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/problems",
		func(c *gin.Context) { c.Set(contextUserKey, user.User{ID: "u1", Username: "nayantha"}) },
		requireProctorAccess(func(context.Context, string, bool) (agent.Decision, error) {
			return agent.Decision{Allowed: false, Code: agent.CodeAgentStopped}, nil
		}, nil, true),
		func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"statement": "secret"}) },
	)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/problems", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), "secret") {
		t.Fatalf("expected handler body, got %s", w.Body.String())
	}
}

