package api

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
)

const minEvaluationTestCases = 5

type testCaseDTO struct {
	Ordinal  int32  `json:"ordinal"`
	Input    string `json:"input"`
	Expected string `json:"expected"`
	Points   int32  `json:"points"`
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
	Tests         []testCaseDTO         `json:"tests"`
}

type publishPayload struct {
	Published bool `json:"published"`
}

type replaceTestsPayload struct {
	Tests []testCaseDTO `json:"tests"`
}

func validateTestsAgainstSamples(samples []problem.SampleInput, tests []testCaseDTO) error {
	for _, t := range tests {
		tInput := strings.TrimSpace(t.Input)
		tExpected := strings.TrimSpace(t.Expected)
		for _, s := range samples {
			sInput := strings.TrimSpace(s.Input)
			sOutput := strings.TrimSpace(s.Output)
			if tInput == sInput && tExpected == sOutput {
				return fmt.Errorf("evaluation test case %d is identical to sample %d; evaluation test cases must be distinct from public samples", t.Ordinal, s.Ordinal)
			}
		}
	}
	return nil
}

// @Summary Admin List All Problems
// @Description Fetch all problems including draft and published problems.
// @Tags Admin
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string][]problem.Problem
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Router /api/v1/admin/problems [get]
func (h *handler) listAllProblems(c *gin.Context) {
	problems, err := h.problems.ListAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list problems"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"problems": problems})
}

// @Summary Admin Get Problem by ID
// @Description Fetch full problem details by ID for editing.
// @Tags Admin
// @Produce json
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Success 200 {object} map[string]problem.ProblemDetail
// @Failure 404 {object} map[string]string
// @Router /api/v1/admin/problems/{id} [get]
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

// @Summary Admin Create Problem
// @Description Create a new contest problem with metadata, sample test cases, and optional evaluation test cases.
// @Tags Admin
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param payload body problemPayload true "Problem definition"
// @Success 201 {object} map[string]problem.ProblemDetail
// @Failure 400 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Router /api/v1/admin/problems [post]
func (h *handler) createProblem(c *gin.Context) {
	var req problemPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	if err := problem.ValidateSlug(req.Slug); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Published && len(req.Tests) < minEvaluationTestCases {
		c.JSON(http.StatusBadRequest, gin.H{"error": "published problems require at least 5 evaluation test cases"})
		return
	}

	if len(req.Tests) > 0 {
		if err := validateTestsAgainstSamples(req.Samples, req.Tests); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
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

	if len(req.Tests) > 0 {
		inputs := make([]problem.TestInput, len(req.Tests))
		for i, t := range req.Tests {
			inputs[i] = problem.TestInput{
				Ordinal:  t.Ordinal,
				Input:    []byte(t.Input),
				Expected: []byte(t.Expected),
				Points:   t.Points,
			}
		}
		if err := h.problems.ReplaceTests(c.Request.Context(), created.ID, inputs); err != nil {
			if errors.Is(err, problem.ErrPointsMismatch) {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save evaluation test cases"})
			return
		}
		h.judge.InvalidateTests(created.ID)
	}

	c.JSON(http.StatusCreated, gin.H{"problem": created})
}

// @Summary Admin Update Problem
// @Description Update existing problem statement, limits, sample testcases, and optional evaluation test cases.
// @Tags Admin
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Param payload body problemPayload true "Updated problem payload"
// @Success 200 {object} map[string]problem.ProblemDetail
// @Failure 404 {object} map[string]string
// @Router /api/v1/admin/problems/{id} [put]
func (h *handler) updateProblem(c *gin.Context) {
	id := c.Param("id")
	var req problemPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	if req.Slug != "" {
		if err := problem.ValidateSlug(req.Slug); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	if req.Tests != nil {
		if req.Published && len(req.Tests) < minEvaluationTestCases {
			c.JSON(http.StatusBadRequest, gin.H{"error": "published problems require at least 5 evaluation test cases"})
			return
		}
		if err := validateTestsAgainstSamples(req.Samples, req.Tests); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
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

	if req.Tests != nil {
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
			if errors.Is(err, problem.ErrPointsMismatch) {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save evaluation test cases"})
			return
		}
		h.judge.InvalidateTests(id)
	}

	c.JSON(http.StatusOK, gin.H{"problem": updated})
}

// @Summary Admin Toggle Published Status
// @Description Publish or unpublish a problem for contest visibility.
// @Tags Admin
// @Accept json
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Param payload body publishPayload true "Publish state"
// @Success 244 "No Content"
// @Failure 404 {object} map[string]string
// @Router /api/v1/admin/problems/{id}/publish [patch]
func (h *handler) setProblemPublished(c *gin.Context) {
	id := c.Param("id")
	var req publishPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Published {
		tests, err := h.judge.Repo().GetProblemTests(c.Request.Context(), id)
		if err != nil || len(tests) < minEvaluationTestCases {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("cannot publish problem with fewer than %d evaluation test cases", minEvaluationTestCases)})
			return
		}
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

// @Summary Admin Delete Problem
// @Description Delete a problem and all associated test cases.
// @Tags Admin
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Success 244 "No Content"
// @Failure 404 {object} map[string]string
// @Router /api/v1/admin/problems/{id} [delete]
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

// @Summary Admin Replace Test Cases
// @Description Replace official evaluation test cases for a problem.
// @Tags Admin
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Param payload body replaceTestsPayload true "Test cases payload"
// @Success 244 "No Content"
// @Router /api/v1/admin/problems/{id}/tests [put]
func (h *handler) replaceTestCases(c *gin.Context) {
	id := c.Param("id")
	var req replaceTestsPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	detail, err := h.problems.GetByID(c.Request.Context(), id, false)
	if err == nil {
		sampleInputs := make([]problem.SampleInput, len(detail.Samples))
		for i, s := range detail.Samples {
			sampleInputs[i] = problem.SampleInput{
				Ordinal: s.Ordinal,
				Input:   s.Input,
				Output:  s.Output,
			}
		}
		if valErr := validateTestsAgainstSamples(sampleInputs, req.Tests); valErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": valErr.Error()})
			return
		}
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
		if errors.Is(err, problem.ErrPointsMismatch) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.judge.InvalidateTests(id)

	c.Status(http.StatusNoContent)
}

// @Summary Admin Get Problem Test Cases
// @Description Fetch full input and expected output for test cases of a problem.
// @Tags Admin
// @Produce json
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Success 200 {object} map[string][]testCaseDTO
// @Router /api/v1/admin/problems/{id}/tests [get]
func (h *handler) getAdminProblemTests(c *gin.Context) {
	id := c.Param("id")
	tests, err := h.problems.GetFullTests(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch test cases"})
		return
	}

	dtos := make([]testCaseDTO, len(tests))
	for i, t := range tests {
		dtos[i] = testCaseDTO{
			Ordinal:  t.Ordinal,
			Input:    string(t.Input),
			Expected: string(t.Expected),
			Points:   t.Points,
		}
	}

	c.JSON(http.StatusOK, gin.H{"tests": dtos})
}
