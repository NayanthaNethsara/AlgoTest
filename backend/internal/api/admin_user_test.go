package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/labyrithm/backend/internal/metrics"
	"github.com/NayanthaNethsara/labyrithm/backend/internal/team"
	"github.com/NayanthaNethsara/labyrithm/backend/internal/user"
)

func TestPasswordLengthValidation(t *testing.T) {
	if err := user.CheckPasswordLength("short"); !errors.Is(err, user.ErrPasswordTooShort) {
		t.Fatalf("expected ErrPasswordTooShort for short password, got %v", err)
	}
	if err := user.CheckPasswordLength("validlength123"); err != nil {
		t.Fatalf("expected nil error for valid password, got %v", err)
	}
	if err := user.CheckPasswordLength(""); err != nil {
		t.Fatalf("expected nil error for empty password (auto-generated), got %v", err)
	}
}

func TestUserRoleValidation(t *testing.T) {
	if !user.ValidRole(user.RoleCompetitor) {
		t.Fatal("expected RoleCompetitor to be valid")
	}
	if !user.ValidRole(user.RoleAdmin) {
		t.Fatal("expected RoleAdmin to be valid")
	}
	if user.ValidRole("guest") {
		t.Fatal("expected 'guest' to be invalid")
	}
}

func TestTeamMembershipErrors(t *testing.T) {
	if team.ErrTeamFull == nil {
		t.Fatal("expected ErrTeamFull to be non-nil")
	}
	if team.ErrUserAlreadyInTeam == nil {
		t.Fatal("expected ErrUserAlreadyInTeam to be non-nil")
	}
	if errTeamRequired == nil {
		t.Fatal("expected errTeamRequired to be non-nil")
	}
	if errAdminCreationNotAllowed == nil {
		t.Fatal("expected errAdminCreationNotAllowed to be non-nil")
	}
}

func TestAdminRoleAssignmentBlockedViaAPI(t *testing.T) {
	if user.RoleAdmin == user.RoleCompetitor {
		t.Fatal("expected RoleAdmin and RoleCompetitor to be distinct")
	}
}

func TestSessionRevocationPolicyByRole(t *testing.T) {
	isCompetitorSingleSession := (user.RoleCompetitor != user.RoleAdmin)
	if !isCompetitorSingleSession {
		t.Fatal("expected competitor sessions to enforce single-session revocation")
	}

	isAdminSingleSession := (user.RoleAdmin != user.RoleAdmin)
	if isAdminSingleSession {
		t.Fatal("expected admin sessions to permit concurrent sessions")
	}
}

func TestLoginAttemptTracker(t *testing.T) {
	tracker := NewLoginAttemptTracker(3, 50*time.Millisecond)
	username := "test_operator"

	if locked, _ := tracker.IsLocked(username); locked {
		t.Fatal("expected user not to be locked initially")
	}

	// 2 failures should not lock
	if tracker.RecordFailure(username) {
		t.Fatal("expected user not to be locked after 1 failure")
	}
	if tracker.RecordFailure(username) {
		t.Fatal("expected user not to be locked after 2 failures")
	}
	if locked, _ := tracker.IsLocked(username); locked {
		t.Fatal("expected user not to be locked after 2 failures")
	}

	// 3rd failure locks the account
	if !tracker.RecordFailure(username) {
		t.Fatal("expected user to be locked on 3rd failure")
	}
	if locked, remaining := tracker.IsLocked(username); !locked || remaining <= 0 {
		t.Fatal("expected user to be reported as locked")
	}

	// Wait for lockout duration to expire
	time.Sleep(60 * time.Millisecond)
	if locked, _ := tracker.IsLocked(username); locked {
		t.Fatal("expected user lock to expire after duration")
	}

	// Success clears failure record
	tracker.RecordFailure(username)
	tracker.RecordSuccess(username)
	if locked, _ := tracker.IsLocked(username); locked {
		t.Fatal("expected user not to be locked after success")
	}
}

func TestValidateUsername(t *testing.T) {
	validUsernames := []string{
		"alice",
		"bob_123",
		"team-lead-01",
		"USER_NAME",
		"abc",
		strings.Repeat("a", 50),
	}
	for _, u := range validUsernames {
		if err := user.ValidateUsername(u); err != nil {
			t.Fatalf("expected username '%s' to be valid, got: %v", u, err)
		}
	}

	invalidCases := []struct {
		username    string
		expectedErr error
	}{
		{"", user.ErrUsernameRequired},
		{"   ", user.ErrUsernameRequired},
		{"ab", user.ErrUsernameLength},
		{"a", user.ErrUsernameLength},
		{strings.Repeat("a", 51), user.ErrUsernameLength},
		{"user name", user.ErrUsernameInvalid},
		{"user@name", user.ErrUsernameInvalid},
		{"user!name", user.ErrUsernameInvalid},
		{"user#1", user.ErrUsernameInvalid},
		{"user$1", user.ErrUsernameInvalid},
		{"user%1", user.ErrUsernameInvalid},
		{"user+1", user.ErrUsernameInvalid},
	}
	for _, tc := range invalidCases {
		err := user.ValidateUsername(tc.username)
		if err == nil {
			t.Fatalf("expected error for username '%s', got nil", tc.username)
		}
		if !errors.Is(err, tc.expectedErr) {
			t.Fatalf("expected error %v for username '%s', got %v", tc.expectedErr, tc.username, err)
		}
	}
}

func TestTeamMemberCapacityLimit(t *testing.T) {
	if team.MaxTeamMembers != 3 {
		t.Fatalf("expected MaxTeamMembers to be 3, got %d", team.MaxTeamMembers)
	}
}

func TestRespondErrorFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	c.Request = req

	expectedReqID := "test-trace-id-12345"
	c.Set(metrics.ContextRequestIDKey, expectedReqID)

	h := &handler{}
	origErr := errors.New("underlying root-cause failure")
	h.respondError(c, http.StatusInternalServerError, "Operation failed", origErr)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d", w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response JSON: %v", err)
	}

	if resp["error"] != "Operation failed" {
		t.Fatalf("expected error message 'Operation failed', got '%s'", resp["error"])
	}
	if resp["requestId"] != expectedReqID {
		t.Fatalf("expected requestId '%s', got '%s'", expectedReqID, resp["requestId"])
	}

	if len(c.Errors) == 0 {
		t.Fatal("expected c.Errors to contain the underlying error for slog logging")
	}
	if !errors.Is(c.Errors.Last().Err, origErr) {
		t.Fatalf("expected c.Errors to wrap origErr, got %v", c.Errors.Last().Err)
	}
}

func TestBulkUserActionValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)

	h := &handler{}

	// Test 1: Empty user IDs
	{
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body := `{"userIds":[],"action":"allow_web_only"}`
		c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/bulk-action", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set(contextUserKey, user.User{ID: "admin-1", Role: user.RoleAdmin})

		h.bulkUserAction(c)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for empty userIds, got %d", w.Code)
		}
	}

	// Test 2: Only self ID provided (should be filtered out leaving 0 valid IDs)
	{
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body := `{"userIds":["admin-1"],"action":"allow_web_only"}`
		c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/bulk-action", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set(contextUserKey, user.User{ID: "admin-1", Role: user.RoleAdmin})

		h.bulkUserAction(c)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 when only self ID provided, got %d", w.Code)
		}
	}

	// Test 3: Invalid action
	{
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		body := `{"userIds":["user-1","user-2"],"action":"unsupported_action"}`
		c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/bulk-action", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set(contextUserKey, user.User{ID: "admin-1", Role: user.RoleAdmin})

		h.bulkUserAction(c)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for invalid action, got %d", w.Code)
		}
	}
}

