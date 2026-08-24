package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
)

func (h *handler) listAdminSubmissions(c *gin.Context) {
	statusFilter := c.Query("status")
	problemID := c.Query("problem_id")
	teamID := c.Query("team_id")
	limit := 50
	offset := 0

	submissions, total, err := h.judge.Repo().ListAdminSubmissions(c.Request.Context(), statusFilter, problemID, teamID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list submissions: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"submissions": submissions,
		"total":       total,
	})
}

func (h *handler) rejudgeSubmission(c *gin.Context) {
	id := c.Param("id")
	if err := h.judge.Repo().RejudgeSubmission(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to rejudge submission: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "submission re-queued for judging"})
}

func (h *handler) rejudgeProblem(c *gin.Context) {
	id := c.Param("id")
	h.judge.InvalidateTests(id)
	count, err := h.judge.Repo().RejudgeProblemSubmissions(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to rejudge problem submissions: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message":  "problem submissions re-queued for judging",
		"requeued": count,
	})
}

func (h *handler) cancelSubmission(c *gin.Context) {
	id := c.Param("id")
	if err := h.judge.Repo().CancelSubmission(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to cancel submission: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "submission cancelled"})
}

type reviewSubmissionRequest struct {
	Status string `json:"status" binding:"required"`
	Reason string `json:"reason"`
}

// @Summary Review a Submission
// @Description Accept or reject a judged submission.
// @Tags Submissions
// @Accept json
// @Produce json
// @Param id path string true "Submission ID"
// @Param review body reviewSubmissionRequest true "Review decision"
// @Success 200 {object} judge.AdminSubmissionItem
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/v1/admin/submissions/{id}/review [post]
func (h *handler) reviewSubmission(c *gin.Context) {
	var req reviewSubmissionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	status := strings.ToLower(strings.TrimSpace(req.Status))
	if !judge.ValidReviewStatus(status) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be 'accepted' or 'rejected'"})
		return
	}

	reason := strings.TrimSpace(req.Reason)
	if judge.ReviewStatus(status) == judge.ReviewRejected && reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "a reason is required to reject a submission"})
		return
	}

	u := currentUser(c)
	item, err := h.judge.Repo().ReviewSubmission(c.Request.Context(), c.Param("id"), u.ID, judge.ReviewStatus(status), reason)
	if err != nil {
		if errors.Is(err, judge.ErrSubmissionNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "submission not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to review submission: " + err.Error()})
		return
	}

	h.log.Info("submission reviewed",
		"submission_id", item.SubmissionID, "status", status, "reviewer", u.Username)

	h.judge.Broadcaster().Broadcast(item.Result)

	c.JSON(http.StatusOK, gin.H{"submission": item})
}

func (h *handler) unstickTeamSubmissions(c *gin.Context) {
	teamID := c.Param("id")
	if err := h.judge.Repo().UnstickTeamSubmissions(c.Request.Context(), teamID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to unstick team submissions: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "active submission locks cleared for team"})
}
