// Package runner executes untrusted, user-submitted code inside isolate
// (https://github.com/ioi/isolate), the IOI sandbox, and reports back
// stdout/stderr/exit code/timing. It backs the "Run" action in the editor
// (arbitrary stdin, synchronous). It is intentionally separate from
// internal/judge, which grades submissions against a problem's hidden tests.
//
// isolate needs a Linux host with cgroup v2 and the language toolchains
// installed system-wide -- see deploy/provision-isolate.sh. It cannot run on
// macOS, so this package only works on a provisioned Linux server.
package runner

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var ErrUnsupportedLanguage = errors.New("unsupported language")

// outputLimit caps how much stdout/stderr we hand back per run, to keep a
// runaway program (e.g. an infinite print loop) from ballooning a response.
const outputLimit = 128 * 1024

// sandboxDir is where the per-run workspace is bind-mounted inside the sandbox.
// isolate's own box directory is deliberately unused: mounting a directory we
// create ourselves keeps ownership under our control and mirrors what the
// previous Docker implementation did with `-v dir:/sandbox`.
const sandboxDir = "/sandbox"

// fsizeKB bounds any single file the sandboxed program writes. It sits well
// above outputLimit (so truncation, not this, is what trims a flood the user
// sees) but low enough that a print-loop can't fill the disk.
const fsizeKB = 16 * 1024

// openFilesLimit raises isolate's default of 64, which a JVM exhausts on
// startup.
const openFilesLimit = 256

// processLimit contains fork bombs. isolate allows a single process by
// default, which the JVM's threads would trip over immediately.
const processLimit = 128

// sandboxEnv is the entire environment the untrusted program sees. isolate
// passes nothing through by default, and we never use --full-env: the server's
// own environment holds the database URL and session secrets.
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
	compileCmd    []string // nil if the language needs no compile step
	runCmd        []string
	timeFactor    float64 // cpp 1.0, java 2.0, python 3.0
	memoryBonusKB int64   // interpreter/VM overhead bonus
}

// Toolchains are installed on the host rather than baked into per-language
// images, so these commands resolve against sandboxEnv's PATH.
var specs = map[string]spec{
	"cpp": {
		filename:   "main.cpp",
		compileCmd: []string{"g++", "-O2", "-std=c++17", "-o", "main", "main.cpp"},
		runCmd:     []string{"./main"},
		timeFactor: 1.0,
	},
	"java": {
		filename:      "Main.java",
		compileCmd:    []string{"javac", "Main.java"},
		runCmd:        []string{"java", "-XX:+UseSerialGC", "-Xmx{mem}m", "Main"},
		timeFactor:    2.0,
		memoryBonusKB: 128 * 1024,
	},
	"python": {
		filename:      "main.py",
		runCmd:        []string{"python3", "main.py"},
		timeFactor:    3.0,
		memoryBonusKB: 64 * 1024,
	},
}

// Config parameterizes a Runner. WallTimeout is a backstop that force-kills
// the program regardless of what it's doing (catches sleep/blocking I/O that
// burns no CPU); CPUSeconds is the fair compute budget, so interpreter startup
// and idle waiting don't count against a contestant.
type Config struct {
	CompileTimeout  time.Duration
	WallTimeout     time.Duration
	CPUSeconds      float64
	Memory          string
	IsolateBin      string
	CompileMemoryKB int64

	// Concurrency control (per node). MaxConcurrent caps sandboxes running at
	// once and must not exceed isolate's provisioned num_boxes; MaxQueue caps
	// how many extra requests may wait for a box; MaxWait is how long a waiter
	// blocks before giving up with ErrBusy.
	MaxConcurrent int
	RunReserve    int
	MaxQueue      int
	MaxWait       time.Duration
}

// Runner executes Requests inside per-run isolate sandboxes.
type Runner struct {
	cfg     Config
	memKB   int64
	limiter *limiter
}

func New(cfg Config) (*Runner, error) {
	if cfg.IsolateBin == "" {
		cfg.IsolateBin = "isolate"
	}
	if cfg.MaxConcurrent < 1 {
		cfg.MaxConcurrent = 1
	}
	if cfg.CompileMemoryKB <= 0 {
		cfg.CompileMemoryKB = 1024 * 1024 // 1 GB default compile memory
	}
	memKB, err := parseMemoryKB(cfg.Memory)
	if err != nil {
		return nil, fmt.Errorf("run memory: %w", err)
	}
	return &Runner{
		cfg:     cfg,
		memKB:   memKB,
		limiter: newLimiter(cfg.MaxConcurrent, cfg.MaxQueue, cfg.MaxWait, cfg.RunReserve),
	}, nil
}

// CheckHost verifies isolate is installed and the host is provisioned for the
// configured concurrency, so a misconfigured box fails at boot instead of
// surfacing as 500s on the first burst of traffic.
func (r *Runner) CheckHost(ctx context.Context) error {
	// Clean up dirty state before checking highest box ID
	highest := r.cfg.MaxConcurrent - 1
	r.cleanupBox(highest)
	if _, err := r.initBox(ctx, highest); err != nil {
		return fmt.Errorf("box %d unavailable (raise num_boxes in isolate's config to at least %d): %w",
			highest, r.cfg.MaxConcurrent, err)
	}
	r.cleanupBox(highest)
	return nil
}

// OverallTimeout bounds the whole Run call (compile + run + sandbox overhead),
// for callers that want to derive a request-scoped context.
func (r *Runner) OverallTimeout() time.Duration {
	return r.cfg.CompileTimeout + r.cfg.WallTimeout + 10*time.Second
}

func (r *Runner) Run(ctx context.Context, req Request) (Result, error) {
	sp, ok := specs[req.Language]
	if !ok {
		return Result{}, fmt.Errorf("%w: %s", ErrUnsupportedLanguage, req.Language)
	}

	// Reserve a box before doing any work, so overflow is rejected cheaply.
	slot, release, err := r.limiter.acquireRun(ctx)
	if err != nil {
		return Result{}, err
	}
	defer release()

	// Once the slot is acquired, derive a fresh execution deadline context
	// independent of the time spent waiting in the queue.
	execCtx, execCancel := context.WithTimeout(context.Background(), r.OverallTimeout())
	defer execCancel()

	baseCPU := req.Limits.CPUSeconds
	if baseCPU <= 0 {
		baseCPU = r.cfg.CPUSeconds
	}
	if baseCPU <= 0 {
		baseCPU = 2.0
	}
	effectiveCPU := baseCPU * sp.timeFactor

	effectiveWall := req.Limits.Wall
	if effectiveWall <= 0 {
		effectiveWall = r.cfg.WallTimeout
	}
	if effectiveWall <= 0 {
		effectiveWall = 10 * time.Second
	}

	reqMemKB := req.Limits.MemoryKB
	if reqMemKB <= 0 {
		reqMemKB = r.memKB
	}
	if reqMemKB <= 0 {
		reqMemKB = 256 * 1024
	}

	compileTimeout := req.Limits.CompileTimeout
	if compileTimeout <= 0 {
		compileTimeout = r.cfg.CompileTimeout
	}
	if compileTimeout <= 0 {
		compileTimeout = 10 * time.Second
	}

	compileMemKB := req.Limits.CompileMemoryKB
	if compileMemKB <= 0 {
		compileMemKB = r.cfg.CompileMemoryKB
	}

	// Two directories: work/ is bind-mounted into the sandbox, the parent is
	// not. Meta files must stay outside, or the program under test could
	// rewrite them and forge its own verdict.
	base, err := os.MkdirTemp("", "algothon-run-*")
	if err != nil {
		return Result{}, fmt.Errorf("creating workspace: %w", err)
	}
	defer os.RemoveAll(base)

	work := filepath.Join(base, "work")
	if err := os.Mkdir(work, 0o777); err != nil {
		return Result{}, fmt.Errorf("creating workspace: %w", err)
	}
	// The sandboxed program runs as isolate's own unprivileged UID, so the
	// bind-mounted workspace has to be writable by it.
	if err := os.Chmod(work, 0o777); err != nil {
		return Result{}, fmt.Errorf("preparing workspace: %w", err)
	}
	if err := os.WriteFile(filepath.Join(work, sp.filename), []byte(req.Code), 0o644); err != nil {
		return Result{}, fmt.Errorf("writing source: %w", err)
	}
	if err := os.WriteFile(filepath.Join(work, "stdin.txt"), []byte(req.Stdin), 0o644); err != nil {
		return Result{}, fmt.Errorf("writing stdin: %w", err)
	}

	if _, err := r.initBox(execCtx, slot.BoxID); err != nil {
		return Result{}, err
	}
	defer r.cleanupBox(slot.BoxID)

	// Compile gets a separate compile memory cap to prevent heavy compiles from OOMing
	if sp.compileCmd != nil {
		m, err := r.execBox(execCtx, slot.BoxID, base, work, "compile", sp.compileCmd, execOpts{
			wall:     compileTimeout,
			memoryKB: compileMemKB,
			core:     slot.Core,
		})
		if err != nil {
			return Result{}, err
		}
		if m.status == statusTimedOut {
			return Result{
				Stderr:       "compile timed out",
				CompileError: "compile timed out",
				ExitCode:     -1,
				Verdict:      VerdictCE,
				TimeMs:       int64(m.timeCPU * 1000),
				MemoryKB:     m.cgMemKB,
			}, nil
		}
		if code := m.exitCodeOrSignal(); code != 0 {
			compileOut := readCapped(filepath.Join(work, "compile.out"))
			compileErr := readCapped(filepath.Join(work, "compile.err"))
			exactErr := combineOutput(compileOut, compileErr)
			if exactErr == "" {
				exactErr = "compilation failed"
			}
			return Result{
				Stderr:       exactErr,
				CompileError: exactErr,
				ExitCode:     code,
				Verdict:      VerdictCE,
				TimeMs:       int64(m.timeCPU * 1000),
				MemoryKB:     m.cgMemKB,
			}, nil
		}
	}

	// Prepare run command with dynamic memory limits for Java (-Xmx{mem}m)
	heapMB := reqMemKB / 1024
	if heapMB < 16 {
		heapMB = 16
	}
	runCmd := make([]string, len(sp.runCmd))
	for i, arg := range sp.runCmd {
		runCmd[i] = strings.ReplaceAll(arg, "{mem}", strconv.FormatInt(heapMB, 10))
	}

	totalRunMemKB := reqMemKB + sp.memoryBonusKB
	m, err := r.execBox(execCtx, slot.BoxID, base, work, "run", runCmd, execOpts{
		cpuSeconds: effectiveCPU,
		wall:       effectiveWall,
		memoryKB:   totalRunMemKB,
		stdin:      "stdin.txt",
		core:       slot.Core,
	})
	if err != nil {
		return Result{}, err
	}

	stdout := readCapped(filepath.Join(work, "run.out"))
	cpuMs := int64(m.timeCPU * 1000)
	verdict := m.verdict(reqMemKB)

	if verdict == VerdictTLE {
		return Result{
			Stdout:   stdout,
			Stderr:   "time limit exceeded",
			ExitCode: -1,
			TimeMs:   cpuMs,
			MemoryKB: m.cgMemKB,
			Verdict:  VerdictTLE,
		}, nil
	}

	return Result{
		Stdout:   stdout,
		Stderr:   readCapped(filepath.Join(work, "run.err")),
		ExitCode: m.exitCodeOrSignal(),
		TimeMs:   cpuMs,
		MemoryKB: m.cgMemKB,
		Verdict:  verdict,
	}, nil
}

type execOpts struct {
	cpuSeconds float64
	wall       time.Duration
	memoryKB   int64
	stdin      string // filename within the workspace, empty for no stdin
	core       int
}

// execBox runs one command inside box boxID, with work bind-mounted at
// /sandbox. Resource limits are enforced by isolate itself, so unlike the
// Docker implementation there is no Go-side timeout race or kill path.
func (r *Runner) execBox(
	ctx context.Context,
	boxID int,
	base, work, step string,
	cmd []string,
	opts execOpts,
) (meta, error) {
	metaPath := filepath.Join(base, step+".meta")

	memKB := opts.memoryKB
	if memKB <= 0 {
		memKB = r.memKB
	}

	args := []string{
		"--cg",
		"--box-id=" + strconv.Itoa(boxID),
		"--meta=" + metaPath,
		"--silent",
		// Network isolation is isolate's default (a fresh namespace with only
		// loopback); --share-net would be what turns it off, so it is never set.
		"--dir=" + sandboxDir + "=" + work + ":rw",
		"--dir=/etc/alternatives:maybe",
		"--dir=/proc=proc:fs",
		"--chdir=" + sandboxDir,
		"--processes=" + strconv.Itoa(processLimit),
		"--open-files=" + strconv.Itoa(openFilesLimit),
		"--fsize=" + strconv.Itoa(fsizeKB),
		"--cg-mem=" + strconv.FormatInt(memKB, 10),
		"--wall-time=" + formatSeconds(opts.wall),
		"--stdout=" + sandboxDir + "/" + step + ".out",
		"--stderr=" + sandboxDir + "/" + step + ".err",
	}
	if opts.cpuSeconds > 0 {
		// Soft limit at the fair budget, then a 0.5s grace window before hard kill.
		args = append(args,
			"--time="+formatSeconds(time.Duration(opts.cpuSeconds*float64(time.Second))),
			"--extra-time=0.5",
		)
	}
	if opts.stdin != "" {
		args = append(args, "--stdin="+sandboxDir+"/"+opts.stdin)
	}
	for _, e := range sandboxEnv {
		args = append(args, "--env="+e)
	}

	// Isolate calls execve() directly on cmd[0] without performing PATH resolution.
	// Resolve relative toolchain binary names (e.g. "g++", "python3") to absolute paths.
	resolvedCmd := make([]string, len(cmd))
	copy(resolvedCmd, cmd)
	if len(resolvedCmd) > 0 && !strings.Contains(resolvedCmd[0], "/") {
		if absPath, err := exec.LookPath(resolvedCmd[0]); err == nil {
			resolvedCmd[0] = absPath
		}
	}

	args = append(args, "--run", "--")
	args = append(args, resolvedCmd...)

	execCmd := r.cfg.IsolateBin
	execArgs := args
	if opts.core >= 0 {
		execCmd = "taskset"
		execArgs = append([]string{"-c", strconv.Itoa(opts.core), r.cfg.IsolateBin}, args...)
	}

	// isolate exits non-zero whenever the program itself failed, so the meta
	// file -- not the exit status -- is what we read the outcome from.
	runErr := exec.CommandContext(ctx, execCmd, execArgs...).Run()

	m, err := parseMeta(metaPath)
	if err != nil {
		return meta{}, fmt.Errorf("reading sandbox result: %w (isolate: %v)", err, runErr)
	}
	if m.status == statusInternal {
		return meta{}, fmt.Errorf("sandbox failed: %s", m.message)
	}
	return m, nil
}

func (r *Runner) initBox(ctx context.Context, boxID int) (string, error) {
	out, err := exec.CommandContext(ctx, r.cfg.IsolateBin,
		"--cg", "--box-id="+strconv.Itoa(boxID), "--init").Output()
	if err != nil {
		return "", fmt.Errorf("initializing sandbox %d: %w", boxID, err)
	}
	return strings.TrimSpace(string(out)), nil
}

// cleanupBox always runs, even when the request context is already cancelled:
// leaving a box initialized would poison the next run that draws that ID.
func (r *Runner) cleanupBox(boxID int) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = exec.CommandContext(ctx, r.cfg.IsolateBin,
		"--cg", "--box-id="+strconv.Itoa(boxID), "--cleanup").Run()
}

// readCapped returns at most outputLimit bytes of a sandbox output file,
// flagging the cut so the user knows output is missing. A missing file means
// the program produced nothing.
func readCapped(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()

	data, err := io.ReadAll(io.LimitReader(f, outputLimit+1))
	if err != nil {
		return ""
	}
	if len(data) > outputLimit {
		return string(data[:outputLimit]) + "\n... (truncated)"
	}
	return string(data)
}

// formatSeconds renders a duration for isolate's fractional-second time flags.
func formatSeconds(d time.Duration) string {
	return strconv.FormatFloat(d.Seconds(), 'f', -1, 64)
}

// parseMemoryKB converts a Docker-style size ("256m", "1g", "512k", or plain
// bytes) into the kilobytes isolate expects.
func parseMemoryKB(s string) (int64, error) {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "" {
		return 0, errors.New("empty size")
	}

	multiplier := int64(1)
	switch s[len(s)-1] {
	case 'k':
		multiplier, s = 1024, s[:len(s)-1]
	case 'm':
		multiplier, s = 1024*1024, s[:len(s)-1]
	case 'g':
		multiplier, s = 1024*1024*1024, s[:len(s)-1]
	case 'b':
		s = s[:len(s)-1]
	}

	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid size %q", s)
	}
	kb := n * multiplier / 1024
	if kb <= 0 {
		return 0, fmt.Errorf("size too small: %q", s)
	}
	return kb, nil
}

// combineOutput merges stdout and stderr strings, trimming whitespace and joining non-empty sections.
func combineOutput(stdout, stderr string) string {
	stdout = strings.TrimSpace(stdout)
	stderr = strings.TrimSpace(stderr)
	if stdout == "" {
		return stderr
	}
	if stderr == "" {
		return stdout
	}
	return stdout + "\n" + stderr
}
