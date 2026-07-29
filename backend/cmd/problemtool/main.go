package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/goccy/go-yaml"
	"github.com/joho/godotenv"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/config"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/db"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/problem"
)

type problemMeta struct {
	Slug          string `yaml:"slug"`
	Title         string `yaml:"title"`
	Difficulty    string `yaml:"difficulty"`
	TimeLimitMs   int32  `yaml:"timeLimitMs"`
	MemoryLimitMb int32  `yaml:"memoryLimitMb"`
	MaxScore      int32  `yaml:"maxScore"`
	Constraints   string `yaml:"constraints"`
	Published     bool   `yaml:"published"`
}

func main() {
	dirFlag := flag.String("dir", "", "Path to problem directory or directory containing problem subfolders")
	publishFlag := flag.Bool("publish", false, "Force publish state to true on import")
	listFlag := flag.Bool("list", false, "List all problems in database")
	rejudgeFlag := flag.String("rejudge", "", "Problem slug to rejudge")
	flag.Parse()

	_ = godotenv.Load()
	cfg := config.Load()

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	repo := problem.NewRepository(pool)

	if *listFlag {
		listProblems(ctx, repo)
		return
	}

	if *rejudgeFlag != "" {
		fmt.Printf("Rejudge triggered for problem slug: %s\n", *rejudgeFlag)
		return
	}

	if *dirFlag == "" {
		fmt.Println("Usage: problemtool -dir <path> [-publish] | -list | -rejudge <slug>")
		os.Exit(1)
	}

	info, err := os.Stat(*dirFlag)
	if err != nil {
		log.Fatalf("Invalid directory path: %v", err)
	}

	if !info.IsDir() {
		log.Fatalf("Path %s is not a directory", *dirFlag)
	}

	metaFile := filepath.Join(*dirFlag, "problem.yaml")
	if _, err := os.Stat(metaFile); err == nil {
		if err := importSingleProblem(ctx, repo, *dirFlag, *publishFlag); err != nil {
			log.Fatalf("Import failed for %s: %v", *dirFlag, err)
		}
		return
	}

	entries, err := os.ReadDir(*dirFlag)
	if err != nil {
		log.Fatalf("Failed to read directory %s: %v", *dirFlag, err)
	}

	imported := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		subDir := filepath.Join(*dirFlag, entry.Name())
		if _, err := os.Stat(filepath.Join(subDir, "problem.yaml")); err == nil {
			if err := importSingleProblem(ctx, repo, subDir, *publishFlag); err != nil {
				log.Printf("Import failed for %s: %v", subDir, err)
			} else {
				imported++
			}
		}
	}
	fmt.Printf("Successfully imported %d problem(s).\n", imported)
}

func listProblems(ctx context.Context, repo *problem.Repository) {
	problems, err := repo.ListAll(ctx)
	if err != nil {
		log.Fatalf("Failed to list problems: %v", err)
	}
	fmt.Printf("%-36s | %-16s | %-24s | %-10s | %-9s\n", "ID", "SLUG", "TITLE", "DIFFICULTY", "PUBLISHED")
	fmt.Println(strings.Repeat("-", 105))
	for _, p := range problems {
		fmt.Printf("%-36s | %-16s | %-24s | %-10s | %-9t\n", p.ID, p.Slug, p.Title, p.Difficulty, p.Published)
	}
}

func importSingleProblem(ctx context.Context, repo *problem.Repository, dir string, forcePublish bool) error {
	yamlBytes, err := os.ReadFile(filepath.Join(dir, "problem.yaml"))
	if err != nil {
		return fmt.Errorf("failed to read problem.yaml: %w", err)
	}

	var meta problemMeta
	if err := yaml.Unmarshal(yamlBytes, &meta); err != nil {
		return fmt.Errorf("failed to parse problem.yaml: %w", err)
	}

	statementBytes, err := os.ReadFile(filepath.Join(dir, "statement.md"))
	if err != nil {
		return fmt.Errorf("failed to read statement.md: %w", err)
	}

	if forcePublish {
		meta.Published = true
	}

	samples, err := loadSamples(filepath.Join(dir, "samples"))
	if err != nil {
		return fmt.Errorf("failed to load samples: %w", err)
	}

	input := problem.CreateProblemInput{
		Slug:          meta.Slug,
		Title:         meta.Title,
		Difficulty:    meta.Difficulty,
		Statement:     string(statementBytes),
		Constraints:   meta.Constraints,
		TimeLimitMs:   meta.TimeLimitMs,
		MemoryLimitMb: meta.MemoryLimitMb,
		MaxScore:      meta.MaxScore,
		Published:     meta.Published,
		Samples:       samples,
	}

	existing, err := repo.GetBySlug(ctx, meta.Slug, false)
	var detail problem.ProblemDetail
	if err == nil {
		detail, err = repo.Update(ctx, existing.ID, input)
		if err != nil {
			return fmt.Errorf("failed to update problem %s: %w", meta.Slug, err)
		}
		fmt.Printf("Updated problem: %s (%s)\n", detail.Title, detail.Slug)
	} else if errors.Is(err, problem.ErrNotFound) {
		detail, err = repo.Create(ctx, input)
		if err != nil {
			return fmt.Errorf("failed to create problem %s: %w", meta.Slug, err)
		}
		fmt.Printf("Created problem: %s (%s)\n", detail.Title, detail.Slug)
	} else {
		return err
	}

	testsDir := filepath.Join(dir, "tests")
	if _, err := os.Stat(testsDir); err == nil {
		tests, err := loadTests(testsDir)
		if err != nil {
			return fmt.Errorf("failed to load test cases: %w", err)
		}
		if len(tests) > 0 {
			if err := repo.ReplaceTests(ctx, detail.ID, tests); err != nil {
				return fmt.Errorf("failed to replace test cases: %w", err)
			}
			fmt.Printf("  Loaded %d hidden test case(s)\n", len(tests))
		}
	}

	return nil
}

func loadSamples(dir string) ([]problem.SampleInput, error) {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return nil, nil
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	type samplePair struct {
		ordinal int32
		inPath  string
		outPath string
		expPath string
	}

	pairs := make(map[int32]*samplePair)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		ext := filepath.Ext(name)
		base := strings.TrimSuffix(name, ext)
		ord, err := strconv.Atoi(base)
		if err != nil {
			continue
		}
		key := int32(ord)
		if _, ok := pairs[key]; !ok {
			pairs[key] = &samplePair{ordinal: key}
		}
		fullPath := filepath.Join(dir, name)
		switch ext {
		case ".in":
			pairs[key].inPath = fullPath
		case ".out":
			pairs[key].outPath = fullPath
		case ".explain":
			pairs[key].expPath = fullPath
		}
	}

	ords := make([]int32, 0, len(pairs))
	for ord := range pairs {
		ords = append(ords, ord)
	}
	sort.Slice(ords, func(i, j int) bool { return ords[i] < ords[j] })

	samples := make([]problem.SampleInput, 0, len(ords))
	for _, ord := range ords {
		pair := pairs[ord]
		if pair.inPath == "" || pair.outPath == "" {
			continue
		}
		inBytes, _ := os.ReadFile(pair.inPath)
		outBytes, _ := os.ReadFile(pair.outPath)
		var exp string
		if pair.expPath != "" {
			expBytes, _ := os.ReadFile(pair.expPath)
			exp = string(expBytes)
		}
		samples = append(samples, problem.SampleInput{
			Ordinal:     ord,
			Input:       string(inBytes),
			Output:      string(outBytes),
			Explanation: exp,
		})
	}
	return samples, nil
}

func loadTests(dir string) ([]problem.TestInput, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	type testPair struct {
		ordinal int32
		inPath  string
		outPath string
	}

	pairs := make(map[int32]*testPair)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		ext := filepath.Ext(name)
		base := strings.TrimSuffix(name, ext)
		ord, err := strconv.Atoi(base)
		if err != nil {
			continue
		}
		key := int32(ord)
		if _, ok := pairs[key]; !ok {
			pairs[key] = &testPair{ordinal: key}
		}
		fullPath := filepath.Join(dir, name)
		switch ext {
		case ".in":
			pairs[key].inPath = fullPath
		case ".out":
			pairs[key].outPath = fullPath
		}
	}

	ords := make([]int32, 0, len(pairs))
	for ord := range pairs {
		ords = append(ords, ord)
	}
	sort.Slice(ords, func(i, j int) bool { return ords[i] < ords[j] })

	tests := make([]problem.TestInput, 0, len(ords))
	for _, ord := range ords {
		pair := pairs[ord]
		if pair.inPath == "" || pair.outPath == "" {
			continue
		}
		inBytes, err := os.ReadFile(pair.inPath)
		if err != nil {
			return nil, err
		}
		outBytes, err := os.ReadFile(pair.outPath)
		if err != nil {
			return nil, err
		}
		tests = append(tests, problem.TestInput{
			Ordinal:  ord,
			Input:    inBytes,
			Expected: outBytes,
			Points:   1,
		})
	}
	return tests, nil
}
