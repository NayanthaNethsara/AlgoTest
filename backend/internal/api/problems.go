package api

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
)

func (h *handler) listPublishedProblems(c *gin.Context) {
	problems, err := h.problems.ListPublished(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list problems"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"problems": problems})
}

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

func (h *handler) listAllProblems(c *gin.Context) {
	problems, err := h.problems.ListAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list problems"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"problems": problems})
}

func (h *handler) getAdminProblemByID(c *gin.Context) {
	id := c.Param("id")
	detail, err := h.problems.GetByID(c.Request.Context(), id, true)
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

type problemPayload struct {
	Slug          string                `json:"slug" binding:"required"`
	Title         string                `json:"title" binding:"required"`
	Difficulty    string                `json:"difficulty" binding:"required"`
	Statement     string                `json:"statement" binding:"required"`
	Constraints   string                `json:"constraints"`
	TimeLimitMs   int32                 `json:"timeLimitMs"`
	MemoryLimitMb int32                 `json:"memoryLimitMb"`
	MaxScore      int32                 `json:"maxScore"`
	Published     bool                  `json:"published"`
	Samples       []problem.SampleInput `json:"samples"`
}

func (h *handler) createProblem(c *gin.Context) {
	var req problemPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	created, err := h.problems.Create(c.Request.Context(), problem.CreateProblemInput{
		Slug:          req.Slug,
		Title:         req.Title,
		Difficulty:    req.Difficulty,
		Statement:     req.Statement,
		Constraints:   req.Constraints,
		TimeLimitMs:   req.TimeLimitMs,
		MemoryLimitMb: req.MemoryLimitMb,
		MaxScore:      req.MaxScore,
		Published:     req.Published,
		Samples:       req.Samples,
	})
	if err != nil {
		if errors.Is(err, problem.ErrDuplicateSlug) {
			c.JSON(http.StatusConflict, gin.H{"error": "problem slug already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create problem"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"problem": created})
}

func (h *handler) updateProblem(c *gin.Context) {
	id := c.Param("id")
	var req problemPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updated, err := h.problems.Update(c.Request.Context(), id, problem.CreateProblemInput{
		Slug:          req.Slug,
		Title:         req.Title,
		Difficulty:    req.Difficulty,
		Statement:     req.Statement,
		Constraints:   req.Constraints,
		TimeLimitMs:   req.TimeLimitMs,
		MemoryLimitMb: req.MemoryLimitMb,
		MaxScore:      req.MaxScore,
		Published:     req.Published,
		Samples:       req.Samples,
	})
	if err != nil {
		if errors.Is(err, problem.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update problem"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"problem": updated})
}

type publishPayload struct {
	Published bool `json:"published"`
}

func (h *handler) setProblemPublished(c *gin.Context) {
	id := c.Param("id")
	var req publishPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.problems.SetPublished(c.Request.Context(), id, req.Published); err != nil {
		if errors.Is(err, problem.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to set published status"})
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *handler) deleteProblem(c *gin.Context) {
	id := c.Param("id")
	if err := h.problems.Delete(c.Request.Context(), id); err != nil {
		if errors.Is(err, problem.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete problem"})
		return
	}

	c.Status(http.StatusNoContent)
}

type testCaseDTO struct {
	Ordinal  int32  `json:"ordinal"`
	Input    string `json:"input"`
	Expected string `json:"expected"`
	Points   int32  `json:"points"`
}

type replaceTestsPayload struct {
	Tests []testCaseDTO `json:"tests"`
}

func (h *handler) replaceTestCases(c *gin.Context) {
	id := c.Param("id")
	var req replaceTestsPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	inputs := make([]problem.TestInput, len(req.Tests))
	for i, t := range req.Tests {
		inputs[i] = problem.TestInput{
			Ordinal:  t.Ordinal,
			Input:    []byte(t.Input),
			Expected: []byte(t.Expected),
			Points:   t.Points,
		}
	}

	if err := h.problems.ReplaceTests(c.Request.Context(), id, inputs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}
