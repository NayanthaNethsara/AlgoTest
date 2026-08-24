package api

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/contest"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/judge"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/user"
)

// @Summary List Published Problems
// @Description Fetch list of published contest problems for competitors.
// @Tags Problems
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/problems [get]
func (h *handler) listPublishedProblems(c *gin.Context) {
	u := currentUser(c)

	if h.contest != nil && u.Role != user.RoleAdmin {
		cState := h.contest.GetState()
		if cState.Status == contest.StatusNotStarted {
			c.JSON(http.StatusOK, gin.H{
				"problems":      []problem.Problem{},
				"progress":      map[string]judge.ProblemProgress{},
				"contestStatus": cState.Status,
				"message":       "contest has not started yet",
			})
			return
		}
	}

	problems, err := h.problems.ListPublished(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list problems"})
		return
	}

	teamID := ""
	if u.TeamID != nil {
		teamID = *u.TeamID
	}

	progressMap := make(map[string]judge.ProblemProgress)
	if pMap, pErr := h.judge.Repo().GetTeamProgress(c.Request.Context(), teamID, u.ID); pErr == nil && pMap != nil {
		progressMap = pMap
	}

	c.JSON(http.StatusOK, gin.H{
		"problems": problems,
		"progress": progressMap,
	})
}

// @Summary Get Problem by Slug
// @Description Fetch detailed problem statement and sample testcases by problem slug.
// @Tags Problems
// @Produce json
// @Security BearerAuth
// @Param slug path string true "Problem slug identifier"
// @Success 200 {object} map[string]problem.ProblemDetail
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/problems/{slug} [get]
func (h *handler) getPublishedProblemBySlug(c *gin.Context) {
	slug := c.Param("slug")
	detail, err := h.problems.GetPublishedBySlug(c.Request.Context(), slug)
	if err != nil {
		if errors.Is(err, problem.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get problem"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"problem": detail})
}
