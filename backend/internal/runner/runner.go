// Package runner executes untrusted, user-submitted code inside short-lived,
// network-isolated Docker containers and reports back stdout/stderr/exit
// code/timing. It backs the "Run" action in the editor (arbitrary stdin,
// synchronous). It is intentionally separate from internal/judge, which
// grades submissions against a problem's hidden test cases.
package runner

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

var ErrUnsupportedLanguage = errors.New("unsupported language")

// outputLimit caps how much stdout/stderr we buffer per run, to keep a
// runaway program (e.g. an infinite print loop) from exhausting memory
// before the timeout kills it.
const outputLimit = 128 * 1024

type Request struct {
	Language string
	Code     string
	Stdin    string
}

type Result struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode"`
	TimeMs   int64  `json:"timeMs"`
}

type spec struct {
	image      string
	filename   string
	compileCmd []string // nil if the language needs no compile step
	runCmd     []string
}

var specs = map[string]spec{
	"cpp": {
		image:      "algothon-judge-cpp",
		filename:   "main.cpp",
		compileCmd: []string{"g++", "-O2", "-std=c++17", "-o", "main", "main.cpp"},
		runCmd:     []string{"./main"},
	},
	"java": {
		image:      "algothon-judge-java",
		filename:   "Main.java",
		compileCmd: []string{"javac", "Main.java"},
		runCmd:     []string{"java", "-XX:+UseSerialGC", "-Xmx256m", "Main"},
	},
	"python": {
		image:    "algothon-judge-python",
		filename: "main.py",
		runCmd:   []string{"python3", "main.py"},
	},
}

// Config parameterizes a Runner. WallTimeout is a backstop that force-kills
// the container regardless of what it's doing (catches sleep/blocking I/O that
// burns no CPU); CPUSeconds is the fair compute budget enforced via RLIMIT_CPU,
// so container/JVM startup and idle waiting don't count against a contestant.
type Config struct {
	CompileTimeout time.Duration
	WallTimeout    time.Duration
	CPUSeconds     int
	Memory         string
	// Runtime is the Docker runtime (e.g. "runsc" for gVisor). Empty uses the
	// daemon default -- fine for local dev, but set "runsc" in prod so untrusted
	// code runs against a userspace kernel instead of the host kernel.
	Runtime   string
	DockerBin string

	// Concurrency control (per node). MaxConcurrent caps containers running at
	// once; MaxQueue caps how many extra requests may wait for a slot; MaxWait
	// is how long a waiter blocks before giving up with ErrBusy. MaxConcurrent
	// <= 0 disables limiting.
	MaxConcurrent int
	MaxQueue      int
	MaxWait       time.Duration
}

// Runner executes Requests inside per-run Docker containers.
type Runner struct {
	cfg     Config
	limiter *limiter
}

func New(cfg Config) *Runner {
	if cfg.DockerBin == "" {
		cfg.DockerBin = "docker"
	}
	return &Runner{
		cfg:     cfg,
		limiter: newLimiter(cfg.MaxConcurrent, cfg.MaxQueue, cfg.MaxWait),
	}
}

// OverallTimeout bounds the whole Run call (compile + run + docker overhead),
// for callers that want to derive a request-scoped context.
func (r *Runner) OverallTimeout() time.Duration {
	return r.cfg.CompileTimeout + r.cfg.WallTimeout + 10*time.Second
}

func (r *Runner) Run(ctx context.Context, req Request) (Result, error) {
	sp, ok := specs[req.Language]
	if !ok {
		return Result{}, fmt.Errorf("%w: %s", ErrUnsupportedLanguage, req.Language)
	}

	// Reserve a run slot before doing any work, so overflow is rejected cheaply.
	release, err := r.limiter.acquire(ctx)
	if err != nil {
		return Result{}, err
	}
	defer release()

	dir, err := os.MkdirTemp("", "algothon-run-*")
	if err != nil {
		return Result{}, fmt.Errorf("creating workspace: %w", err)
	}
	defer os.RemoveAll(dir)

	// The container runs as root (see execContainer's --cap-drop/--read-only
	// hardening), so the bind-mounted workspace just needs to be writable.
	if err := os.Chmod(dir, 0o777); err != nil {
		return Result{}, fmt.Errorf("preparing workspace: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dir, sp.filename), []byte(req.Code), 0o666); err != nil {
		return Result{}, fmt.Errorf("writing source: %w", err)
	}

	// Compile gets no CPU-time cap (a big legitimate compile can burn CPU); the
	// wall-clock CompileTimeout is its only bound.
	if sp.compileCmd != nil {
		res, err := r.execContainer(ctx, sp.image, sp.compileCmd, dir, "", r.cfg.CompileTimeout, 0)
		if err != nil {
			return Result{}, err
		}
		if res.timedOut {
			return Result{Stderr: "compile timed out", ExitCode: -1}, nil
		}
		if res.exitCode != 0 {
			return Result{Stderr: res.stderr, ExitCode: res.exitCode}, nil
		}
	}

	// The run gets the fair CPU budget plus a wall-clock backstop.
	res, err := r.execContainer(ctx, sp.image, sp.runCmd, dir, req.Stdin, r.cfg.WallTimeout, r.cfg.CPUSeconds)
	if err != nil {
		return Result{}, err
	}
	if res.timedOut || isCPULimitKill(res.exitCode) {
		return Result{
			Stdout:   res.stdout,
			Stderr:   "time limit exceeded",
			ExitCode: -1,
			TimeMs:   res.elapsed.Milliseconds(),
		}, nil
	}

	return Result{
		Stdout:   res.stdout,
		Stderr:   res.stderr,
		ExitCode: res.exitCode,
		TimeMs:   res.elapsed.Milliseconds(),
	}, nil
}

// isCPULimitKill reports whether an exit code corresponds to RLIMIT_CPU firing:
// 128+SIGXCPU (24) when the soft limit terminates the process, or 128+SIGKILL
// (9) when the hard limit force-kills it.
func isCPULimitKill(exitCode int) bool {
	return exitCode == 128+24 || exitCode == 128+9
}

type execResult struct {
	stdout   string
	stderr   string
	exitCode int
	elapsed  time.Duration
	timedOut bool
}

// execContainer runs a single command inside a fresh, network-isolated,
// resource-capped container bind-mounting dir at /sandbox, and force-kills
// the container if it outlives timeout (the wall-clock backstop). cpuSeconds,
// when > 0, additionally caps user+system CPU time via RLIMIT_CPU so idle
// waiting and startup don't count against the fair compute budget.
func (r *Runner) execContainer(
	ctx context.Context,
	image string,
	args []string,
	dir, stdin string,
	timeout time.Duration,
	cpuSeconds int,
) (execResult, error) {
	name := "algothon-run-" + uuid.NewString()
	dockerArgs := []string{
		"run", "--rm", "-i", "--name", name,
		"--network", "none",
		"--memory", r.cfg.Memory,
		"--memory-swap", r.cfg.Memory,
		"--cpus", "1",
		"--pids-limit", "128",
		"--security-opt", "no-new-privileges",
		"--cap-drop", "ALL",
		"--read-only",
		"--tmpfs", "/tmp:rw,size=64m",
	}
	// gVisor (or any non-default runtime) for real syscall isolation in prod.
	if r.cfg.Runtime != "" {
		dockerArgs = append(dockerArgs, "--runtime", r.cfg.Runtime)
	}
	// Soft limit sends SIGXCPU (terminates), hard limit +1s sends SIGKILL.
	if cpuSeconds > 0 {
		dockerArgs = append(dockerArgs, "--ulimit",
			fmt.Sprintf("cpu=%d:%d", cpuSeconds, cpuSeconds+1))
	}
	dockerArgs = append(dockerArgs,
		"-v", dir+":/sandbox",
		"-w", "/sandbox",
		image,
	)
	dockerArgs = append(dockerArgs, args...)

	cmd := exec.Command(r.dockerBin(), dockerArgs...)
	cmd.Stdin = strings.NewReader(stdin)
	stdout := &limitedBuffer{limit: outputLimit}
	stderr := &limitedBuffer{limit: outputLimit}
	cmd.Stdout = stdout
	cmd.Stderr = stderr

	start := time.Now()
	if err := cmd.Start(); err != nil {
		return execResult{}, fmt.Errorf("starting container: %w", err)
	}

	waitErr := make(chan error, 1)
	go func() { waitErr <- cmd.Wait() }()

	select {
	case werr := <-waitErr:
		res := execResult{stdout: stdout.String(), stderr: stderr.String(), elapsed: time.Since(start)}
		if werr != nil {
			var exitErr *exec.ExitError
			if errors.As(werr, &exitErr) {
				res.exitCode = exitErr.ExitCode()
			} else {
				return execResult{}, fmt.Errorf("running container: %w", werr)
			}
		}
		return res, nil

	case <-time.After(timeout):
		r.killContainer(name)
		<-waitErr
		return execResult{stdout: stdout.String(), stderr: stderr.String(), elapsed: timeout, timedOut: true}, nil

	case <-ctx.Done():
		r.killContainer(name)
		<-waitErr
		return execResult{}, ctx.Err()
	}
}

func (r *Runner) killContainer(name string) {
	killCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = exec.CommandContext(killCtx, r.dockerBin(), "kill", name).Run()
}

func (r *Runner) dockerBin() string {
	if r.cfg.DockerBin == "" {
		return "docker"
	}
	return r.cfg.DockerBin
}

// limitedBuffer caps how many bytes it will retain, discarding (but still
// accepting, so io.Copy-style writers don't error out) anything past limit.
type limitedBuffer struct {
	buf       bytes.Buffer
	limit     int
	truncated bool
}

func (w *limitedBuffer) Write(p []byte) (int, error) {
	remaining := w.limit - w.buf.Len()
	if remaining <= 0 {
		w.truncated = true
		return len(p), nil
	}
	if len(p) > remaining {
		w.buf.Write(p[:remaining])
		w.truncated = true
		return len(p), nil
	}
	return w.buf.Write(p)
}

func (w *limitedBuffer) String() string {
	if w.truncated {
		return w.buf.String() + "\n... (truncated)"
	}
	return w.buf.String()
}
