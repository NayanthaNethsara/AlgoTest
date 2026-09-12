package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestListAuditLogsNilAuditRepo(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &handler{}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/audit-logs", nil)
	c.Request = req

	h.listAuditLogs(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if total, ok := response["total"].(float64); !ok || total != 0 {
		t.Fatalf("expected total 0, got %v", response["total"])
	}
}
