package metrics

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestMetricsAndLoggingMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(GinRequestIDMiddleware(), GinMetricsMiddleware(), GinStructuredLoggingMiddleware(nil))

	r.GET("/api/v1/test/:id", func(c *gin.Context) {
		reqID := c.GetString(ContextRequestIDKey)
		if reqID == "" {
			t.Errorf("expected request_id in context")
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/api/v1/test/123", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	resHeaderID := w.Header().Get(HeaderRequestID)
	if resHeaderID == "" {
		t.Fatalf("expected X-Request-ID response header")
	}

	// Test propagation when client provides X-Request-ID
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodGet, "/api/v1/test/456", nil)
	req2.Header.Set(HeaderRequestID, "custom-id-789")
	r.ServeHTTP(w2, req2)

	if got := w2.Header().Get(HeaderRequestID); got != "custom-id-789" {
		t.Fatalf("expected propagated custom-id-789, got %s", got)
	}
}

func TestJudgeMetricsRecording(t *testing.T) {
	RecordSubmissionQueued()
	RecordSubmissionCompleted("cpp", "AC", 150*time.Millisecond)
	RecordPhaseDuration("cpp", "compile", 50*time.Millisecond)
}

func TestExtractStructID(t *testing.T) {
	type Dummy struct {
		ID   string
		Name string
	}

	d := Dummy{ID: "usr-42", Name: "Alice"}
	if id := extractStructID(d); id != "usr-42" {
		t.Fatalf("expected usr-42, got %s", id)
	}

	dp := &Dummy{ID: "usr-99", Name: "Bob"}
	if id := extractStructID(dp); id != "usr-99" {
		t.Fatalf("expected usr-99, got %s", id)
	}

	if id := extractStructID(nil); id != "" {
		t.Fatalf("expected empty string, got %s", id)
	}
}
