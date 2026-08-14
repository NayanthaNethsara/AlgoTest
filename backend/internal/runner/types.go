package runner

import (
	"errors"
	"time"
)

var ErrUnsupportedLanguage = errors.New("unsupported language")

// outputLimit caps how much stdout/stderr we hand back per run, to keep a
// runaway program (e.g. an infinite print loop) from ballooning a response.
const outputLimit = 128 * 1024

// sandboxDir is where the per-run workspace is bind-mounted inside the sandbox.
const sandboxDir = "/sandbox"

// sandboxGrace is how much longer isolate may live than the limit we hand it.
// Killing it at the same instant leaves no meta file, and a timed-out run then
// reads back as a pass.
const sandboxGrace = 5 * time.Second

// fsizeKB bounds any single file the sandboxed program writes.
const fsizeKB = 16 * 1024

// openFilesLimit raises isolate's default of 64.
const openFilesLimit = 256

// processLimit contains fork bombs.
const processLimit = 128

// sandboxEnv is the entire environment the untrusted program sees.
var sandboxEnv = []string{
	"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
	"HOME=" + sandboxDir,
	"LANG=C.UTF-8",
}

type Limits struct {
	CPUSeconds      float64       // isolate accepts fractional --time
	Wall            time.Duration // Wall-clock timeout backstop
	MemoryKB        int64         // Per-request memory limit in KB
	CompileTimeout  time.Duration // Compile timeout
	CompileMemoryKB int64         // Separate compile memory limit in KB
}

type Request struct {
	Language string
	Code     string
	Stdin    string
	Limits   Limits
}

type Result struct {
	Stdout       string  `json:"stdout"`
	Stderr       string  `json:"stderr"`
	CompileError string  `json:"compileError,omitempty"`
	ExitCode     int     `json:"exitCode"`
	TimeMs       int64   `json:"timeMs"`
	MemoryKB     int64   `json:"memoryKb"`
	Verdict      Verdict `json:"verdict"`
}

type spec struct {
	filename      string
	compileCmd    []string
	runCmd        []string
	timeFactor    float64
	memoryBonusKB int64
}

// Toolchains installed on host
var specs = map[string]spec{
	"cpp": {
		filename:   "main.cpp",
		compileCmd: []string{"g++", "-O2", "-std=c++17", "-o", "main", "main.cpp"},
		runCmd:     []string{"./main"},
		timeFactor: 1.0,
	},
	"python": {
		filename:      "main.py",
		runCmd:        []string{"python3", "main.py"},
		timeFactor:    3.0,
		memoryBonusKB: 64 * 1024,
	},
	"js": {
		filename:      "main.js",
		runCmd:        []string{"node", "main.js"},
		timeFactor:    2.0,
		memoryBonusKB: 64 * 1024,
	},
}

type Config struct {
	CompileTimeout time.Duration
	WallTimeout    time.Duration
	CPUSeconds     float64
	Memory         string
	IsolateBin     string
	// WorkRoot should be a size-capped tmpfs: workspaces are bind-mounted, so
	// isolate's --quota cannot bound them. Empty means the system temp dir.
	WorkRoot        string
	CompileMemoryKB int64
	CPUList         string

	MaxConcurrent int
	RunReserve    int
	MaxQueue      int
	MaxWait       time.Duration
}

type BatchCase struct {
	Ordinal int
	Stdin   string
}

type BatchRequest struct {
	Language string
	Code     string
	Cases    []BatchCase
	Limits   Limits
	OnCase   func(result BatchCaseResult)
}

type BatchCaseResult struct {
	Ordinal  int
	Stdout   string
	Stderr   string
	ExitCode int
	TimeMs   int64
	MemoryKB int64
	Verdict  Verdict
}

type BatchResult struct {
	CompileError string
	Cases        []BatchCaseResult
}
