package api

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
	"github.com/gin-gonic/gin"
)

const (
	minEvaluationTestCases = 5
	maxSingleTestFileSize  = 20 * 1024 * 1024 // 20MB max per single test file
)

type testCaseDTO struct {
	Ordinal  int32  `json:"ordinal"`
	Input    string `json:"input"`
	Expected string `json:"expected"`
	Points   int32  `json:"points"`
}

type replaceTestsPayload struct {
	Tests []testCaseDTO `json:"tests"`
}

type updatePointsPayload struct {
	Points map[int32]int32 `json:"points" binding:"required"`
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

// @Summary Admin Replace Test Cases
// @Description Replace official evaluation test cases for a problem.
// @Tags Admin
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Param payload body replaceTestsPayload true "Test cases payload"
// @Success 204 "No Content"
// @Router /api/v1/admin/problems/{id}/tests [put]
func (h *handler) replaceTestCases(c *gin.Context) {
	id := c.Param("id")
	var req replaceTestsPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.Tests) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "test cases list cannot be empty"})
		return
	}
	for _, t := range req.Tests {
		if t.Points < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("test case %d points cannot be negative", t.Ordinal)})
			return
		}
		if len(t.Input) == 0 || len(t.Expected) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("test case %d input and expected output cannot be empty", t.Ordinal)})
			return
		}
		if len(t.Input) > maxSingleTestFileSize || len(t.Expected) > maxSingleTestFileSize {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("test case %d exceeds max size of %d MB", t.Ordinal, maxSingleTestFileSize/(1024*1024))})
			return
		}
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
// @Description Fetch test case metadata for a problem (does not transmit full bodies).
// @Tags Admin
// @Produce json
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Success 200 {object} map[string][]problem.TestCaseMetadata
// @Router /api/v1/admin/problems/{id}/tests [get]
func (h *handler) getAdminProblemTests(c *gin.Context) {
	id := c.Param("id")
	meta, err := h.problems.GetTestMetadata(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch test case metadata"})
		return
	}
	if meta == nil {
		meta = []problem.TestCaseMetadata{}
	}
	c.JSON(http.StatusOK, gin.H{"tests": meta})
}

// @Summary Admin Add Single Test Case
// @Description Add an evaluation test case with input and expected output (supports multipart up to 20MB or JSON).
// @Tags Admin
// @Accept multipart/form-data,json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Router /api/v1/admin/problems/{id}/tests [post]
func (h *handler) addSingleTestCase(c *gin.Context) {
	id := c.Param("id")
	var inputBytes, expectedBytes []byte
	var points int32

	contentType := c.ContentType()
	if strings.HasPrefix(contentType, "multipart/form-data") {
		form, err := c.MultipartForm()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid multipart form: " + err.Error()})
			return
		}

		if inFiles := form.File["input"]; len(inFiles) > 0 {
			file := inFiles[0]
			if file.Size > maxSingleTestFileSize {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("input file exceeds max size of %d MB", maxSingleTestFileSize/(1024*1024))})
				return
			}
			f, err := file.Open()
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "failed to open input file"})
				return
			}
			defer f.Close()
			inputBytes, _ = io.ReadAll(f)
		} else if inVals := form.Value["input"]; len(inVals) > 0 {
			inputBytes = []byte(inVals[0])
		}

		if expFiles := form.File["expected"]; len(expFiles) > 0 {
			file := expFiles[0]
			if file.Size > maxSingleTestFileSize {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("expected output file exceeds max size of %d MB", maxSingleTestFileSize/(1024*1024))})
				return
			}
			f, err := file.Open()
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "failed to open expected output file"})
				return
			}
			defer f.Close()
			expectedBytes, _ = io.ReadAll(f)
		} else if expVals := form.Value["expected"]; len(expVals) > 0 {
			expectedBytes = []byte(expVals[0])
		}

		if ptVals := form.Value["points"]; len(ptVals) > 0 {
			if parsed, err := strconv.Atoi(ptVals[0]); err == nil {
				points = int32(parsed)
			}
		}
	} else {
		var req testCaseDTO
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json payload: " + err.Error()})
			return
		}
		inputBytes = []byte(req.Input)
		expectedBytes = []byte(req.Expected)
		points = req.Points
	}

	if points < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "test case points cannot be negative"})
		return
	}
	if len(inputBytes) > maxSingleTestFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("input file exceeds max size of %d MB", maxSingleTestFileSize/(1024*1024))})
		return
	}
	if len(expectedBytes) > maxSingleTestFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("expected output file exceeds max size of %d MB", maxSingleTestFileSize/(1024*1024))})
		return
	}
	if len(inputBytes) == 0 || len(expectedBytes) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "both input and expected output are required"})
		return
	}

	detail, err := h.problems.GetByID(c.Request.Context(), id, false)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
		return
	}
	trimmedIn := strings.TrimSpace(string(inputBytes))
	trimmedExp := strings.TrimSpace(string(expectedBytes))
	for _, s := range detail.Samples {
		if trimmedIn == strings.TrimSpace(s.Input) && trimmedExp == strings.TrimSpace(s.Output) {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("test case is identical to public sample %d; evaluation test cases must be distinct", s.Ordinal)})
			return
		}
	}

	meta, err := h.problems.AddSingleTest(c.Request.Context(), id, inputBytes, expectedBytes, points)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to save test case: %v", err)})
		return
	}

	h.judge.InvalidateTests(id)
	allTests, _ := h.problems.GetTestMetadata(c.Request.Context(), id)
	if allTests == nil {
		allTests = []problem.TestCaseMetadata{meta}
	}
	c.JSON(http.StatusCreated, gin.H{"test": meta, "tests": allTests})
}

// @Summary Admin Update Single Test Case
// @Description Update an existing test case's input, expected output, or points.
// @Tags Admin
// @Accept multipart/form-data,json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Param ordinal path int true "Test Case Ordinal"
// @Router /api/v1/admin/problems/{id}/tests/{ordinal} [put]
func (h *handler) updateSingleTestCase(c *gin.Context) {
	id := c.Param("id")
	ord, err := strconv.Atoi(c.Param("ordinal"))
	if err != nil || ord < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid test case ordinal"})
		return
	}

	var inputBytes, expectedBytes []byte
	var points *int32

	contentType := c.ContentType()
	if strings.HasPrefix(contentType, "multipart/form-data") {
		form, err := c.MultipartForm()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid multipart form: " + err.Error()})
			return
		}

		if inFiles := form.File["input"]; len(inFiles) > 0 {
			file := inFiles[0]
			if file.Size > maxSingleTestFileSize {
				c.JSON(http.StatusBadRequest, gin.H{"error": "input file exceeds 20MB limit"})
				return
			}
			f, _ := file.Open()
			defer f.Close()
			inputBytes, _ = io.ReadAll(f)
		} else if inVals := form.Value["input"]; len(inVals) > 0 {
			inputBytes = []byte(inVals[0])
		}

		if expFiles := form.File["expected"]; len(expFiles) > 0 {
			file := expFiles[0]
			if file.Size > maxSingleTestFileSize {
				c.JSON(http.StatusBadRequest, gin.H{"error": "expected file exceeds 20MB limit"})
				return
			}
			f, _ := file.Open()
			defer f.Close()
			expectedBytes, _ = io.ReadAll(f)
		} else if expVals := form.Value["expected"]; len(expVals) > 0 {
			expectedBytes = []byte(expVals[0])
		}

		if ptVals := form.Value["points"]; len(ptVals) > 0 {
			if parsed, err := strconv.Atoi(ptVals[0]); err == nil {
				p := int32(parsed)
				points = &p
			}
		}
	} else {
		var req testCaseDTO
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json payload: " + err.Error()})
			return
		}
		if req.Input != "" {
			inputBytes = []byte(req.Input)
		}
		if req.Expected != "" {
			expectedBytes = []byte(req.Expected)
		}
		p := req.Points
		points = &p
	}

	if points != nil && *points < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "test case points cannot be negative"})
		return
	}
	if len(inputBytes) > maxSingleTestFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("input file exceeds max size of %d MB", maxSingleTestFileSize/(1024*1024))})
		return
	}
	if len(expectedBytes) > maxSingleTestFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("expected output file exceeds max size of %d MB", maxSingleTestFileSize/(1024*1024))})
		return
	}

	meta, err := h.problems.UpdateSingleTest(c.Request.Context(), id, int32(ord), inputBytes, expectedBytes, points)
	if err != nil {
		if errors.Is(err, problem.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "test case not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to update test case: %v", err)})
		return
	}

	h.judge.InvalidateTests(id)
	c.JSON(http.StatusOK, gin.H{"test": meta})
}

// @Summary Admin Delete Single Test Case
// @Description Delete a test case and re-sequence remaining ordinals.
// @Tags Admin
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Param ordinal path int true "Test Case Ordinal"
// @Router /api/v1/admin/problems/{id}/tests/{ordinal} [delete]
func (h *handler) deleteSingleTestCase(c *gin.Context) {
	id := c.Param("id")
	ord, err := strconv.Atoi(c.Param("ordinal"))
	if err != nil || ord < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid test case ordinal"})
		return
	}

	detail, err := h.problems.GetByID(c.Request.Context(), id, false)
	if err == nil && detail.Published {
		meta, metaErr := h.problems.GetTestMetadata(c.Request.Context(), id)
		if metaErr == nil && len(meta) <= minEvaluationTestCases {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("cannot delete test case: published problems require at least %d evaluation test cases", minEvaluationTestCases)})
			return
		}
	}

	if err := h.problems.DeleteSingleTest(c.Request.Context(), id, int32(ord)); err != nil {
		if errors.Is(err, problem.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "test case not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to delete test case: %v", err)})
		return
	}

	h.judge.InvalidateTests(id)
	c.Status(http.StatusNoContent)
}

// @Summary Admin Update Test Points
// @Description Update point values for multiple test cases.
// @Tags Admin
// @Accept json
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Param payload body updatePointsPayload true "Points map by ordinal"
// @Router /api/v1/admin/problems/{id}/tests/points [patch]
func (h *handler) updateTestPoints(c *gin.Context) {
	id := c.Param("id")
	var req updatePointsPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	detail, err := h.problems.GetByID(c.Request.Context(), id, false)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
		return
	}

	if len(req.Points) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "points payload cannot be empty"})
		return
	}

	var sum int32
	for ord, pts := range req.Points {
		if ord < 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid test case ordinal %d", ord)})
			return
		}
		if pts < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("test case %d points cannot be negative", ord)})
			return
		}
		sum += pts
	}
	if sum != detail.MaxScore {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("points sum (%d) does not match problem max score (%d)", sum, detail.MaxScore)})
		return
	}

	if err := h.problems.UpdateTestPoints(c.Request.Context(), id, req.Points); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to update test points: %v", err)})
		return
	}

	h.judge.InvalidateTests(id)
	c.Status(http.StatusNoContent)
}

// @Summary Admin Get Single Test Input Content
// @Description Download raw input file/content for a single test case.
// @Tags Admin
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Param ordinal path int true "Test Case Ordinal"
// @Router /api/v1/admin/problems/{id}/tests/{ordinal}/input [get]
func (h *handler) getAdminSingleTestInput(c *gin.Context) {
	id := c.Param("id")
	ord, err := strconv.Atoi(c.Param("ordinal"))
	if err != nil || ord < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid test case ordinal"})
		return
	}

	content, err := h.problems.GetSingleTestContent(c.Request.Context(), id, int32(ord), true)
	if err != nil {
		if errors.Is(err, problem.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "test case not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read test input"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"case_%d.in\"", ord))
	c.Data(http.StatusOK, "application/octet-stream", content)
}

// @Summary Admin Get Single Test Expected Content
// @Description Download raw expected output file/content for a single test case.
// @Tags Admin
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Param ordinal path int true "Test Case Ordinal"
// @Router /api/v1/admin/problems/{id}/tests/{ordinal}/expected [get]
func (h *handler) getAdminSingleTestExpected(c *gin.Context) {
	id := c.Param("id")
	ord, err := strconv.Atoi(c.Param("ordinal"))
	if err != nil || ord < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid test case ordinal"})
		return
	}

	content, err := h.problems.GetSingleTestContent(c.Request.Context(), id, int32(ord), false)
	if err != nil {
		if errors.Is(err, problem.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "test case not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read test expected output"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"case_%d.out\"", ord))
	c.Data(http.StatusOK, "application/octet-stream", content)
}

// @Summary Admin Export All Problem Test Cases as ZIP
// @Description Download all test cases for a problem bundled as a ZIP archive.
// @Tags Admin
// @Produce application/zip
// @Security BearerAuth
// @Param id path string true "Problem ID"
// @Router /api/v1/admin/problems/{id}/tests/export [get]
func (h *handler) exportProblemTestsZip(c *gin.Context) {
	id := c.Param("id")
	detail, err := h.problems.GetByID(c.Request.Context(), id, false)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
		return
	}

	tests, err := h.problems.GetFullTests(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load test cases"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s_tests.zip\"", detail.Slug))
	c.Header("Content-Type", "application/zip")

	zw := zip.NewWriter(c.Writer)
	defer zw.Close()

	for _, t := range tests {
		inName := fmt.Sprintf("%02d.in", t.Ordinal)
		inWriter, err := zw.Create(inName)
		if err == nil {
			inWriter.Write(t.Input)
		}

		outName := fmt.Sprintf("%02d.out", t.Ordinal)
		outWriter, err := zw.Create(outName)
		if err == nil {
			outWriter.Write(t.Expected)
		}
	}
}
