package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCORSMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	allowedOrigins := []string{
		"http://localhost:3000",
		"http://localhost:3001",
		"https://portal.algothon.io",
		"*", // Wildcard should be ignored when credentials are true
	}

	r := gin.New()
	r.Use(corsMiddleware(allowedOrigins))
	r.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	testCases := []struct {
		name          string
		origin        string
		expectAllowed bool
	}{
		{
			name:          "configured web origin",
			origin:        "http://localhost:3000",
			expectAllowed: true,
		},
		{
			name:          "configured production portal origin",
			origin:        "https://portal.algothon.io",
			expectAllowed: true,
		},
		{
			name:          "tauri macOS/Linux standard origin",
			origin:        "tauri://localhost",
			expectAllowed: true,
		},
		{
			name:          "tauri custom scheme origin",
			origin:        "tauri://mini-algothon",
			expectAllowed: true,
		},
		{
			name:          "tauri Windows http origin",
			origin:        "http://tauri.localhost",
			expectAllowed: true,
		},
		{
			name:          "tauri Windows https origin",
			origin:        "https://tauri.localhost",
			expectAllowed: true,
		},
		{
			name:          "unauthorized third-party origin",
			origin:        "https://evil-attacker.com",
			expectAllowed: false,
		},
		{
			name:          "unauthorized local port",
			origin:        "http://localhost:8081",
			expectAllowed: false,
		},
		{
			name:          "empty origin",
			origin:        "",
			expectAllowed: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodGet, "/test", nil)
			if err != nil {
				t.Fatalf("failed to create request: %v", err)
			}
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}

			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			allowOrigin := w.Header().Get("Access-Control-Allow-Origin")
			allowCreds := w.Header().Get("Access-Control-Allow-Credentials")

			if tc.expectAllowed {
				if allowOrigin != tc.origin {
					t.Errorf("origin %q: expected Access-Control-Allow-Origin=%q, got %q", tc.origin, tc.origin, allowOrigin)
				}
				if allowCreds != "true" {
					t.Errorf("origin %q: expected Access-Control-Allow-Credentials=true, got %q", tc.origin, allowCreds)
				}
			} else {
				if allowOrigin != "" {
					t.Errorf("origin %q: expected no Access-Control-Allow-Origin header, got %q", tc.origin, allowOrigin)
				}
			}
		})
	}
}
