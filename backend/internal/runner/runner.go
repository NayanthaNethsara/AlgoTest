// Package runner executes untrusted, user-submitted code inside isolate.
package runner

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

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
		limiter: newLimiter(cfg.MaxConcurrent, cfg.MaxQueue, cfg.MaxWait, cfg.RunReserve, cfg.CPUList),
	}, nil
}

// CheckHost verifies isolate is installed and the host is provisioned.
func (r *Runner) CheckHost(ctx context.Context) error {
	highest := r.cfg.MaxConcurrent - 1
	r.cleanupBox(highest)
	if _, err := r.initBox(ctx, highest); err != nil {
		return fmt.Errorf("box %d unavailable (raise num_boxes in isolate's config to at least %d): %w",
			highest, r.cfg.MaxConcurrent, err)
	}
	r.cleanupBox(highest)
	return nil
}

// OverallTimeout bounds the whole Run call (compile + run + sandbox overhead).
// Both steps may use their limit plus sandboxGrace, so the ceiling has to clear
// the sum of the two or it, not isolate, becomes the thing that stops the run.
func (r *Runner) OverallTimeout() time.Duration {
	return r.cfg.CompileTimeout + r.cfg.WallTimeout + 2*sandboxGrace + 10*time.Second
}

// batchTimeout bounds a whole RunBatch call. Each case gets its own wall-clock
// budget, so the ceiling has to scale with the number of cases: a fixed
// per-submission cap silently cancels the tail of a large test set and reports
// those cases as runtime errors, which reads to a competitor as a wrong answer
// on a solution that was merely slow.
//
// Callers that hold a lease on the submission must renew it against this same
// figure -- see Judge.processNext.
func batchTimeout(compile, wall time.Duration, cases int) time.Duration {
	if cases < 1 {
		cases = 1
	}
	// Each case may take its wall limit plus sandboxGrace, and a second more for
	// isolate's own setup, teardown, and the box recycle between cases.
	perCase := wall + sandboxGrace + time.Second
	return compile + sandboxGrace + time.Duration(cases)*perCase + 10*time.Second
}

// BatchTimeout is batchTimeout resolved against this runner's configured
// defaults, for callers sizing a lease or a request deadline.
func (r *Runner) BatchTimeout(cases int) time.Duration {
	return batchTimeout(r.cfg.CompileTimeout, r.cfg.WallTimeout, cases)
}

func (r *Runner) Run(ctx context.Context, req Request) (Result, error) {
	sp, ok := specs[normalizeLanguage(req.Language)]
	if !ok {
		return Result{}, fmt.Errorf("%w: %s", ErrUnsupportedLanguage, req.Language)
	}

	slot, release, err := r.limiter.acquireRun(ctx)
	if err != nil {
		return Result{}, err
	}
	defer release()

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
	effectiveWall = wallFloor(effectiveWall, effectiveCPU)

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
	if compileMemKB <= 0 {
		compileMemKB = 1024 * 1024
	}

	base, err := os.MkdirTemp(r.cfg.WorkRoot, "algothon-run-*")
	if err != nil {
		return Result{}, fmt.Errorf("creating workspace: %w", err)
	}
	defer os.RemoveAll(base)

	work, err := makeWorkDir(base)
	if err != nil {
		return Result{}, err
	}

	_, err = r.initBox(execCtx, slot.BoxID)
	if err != nil {
		return Result{}, fmt.Errorf("init box %d: %w", slot.BoxID, err)
	}
	defer r.cleanupBox(slot.BoxID)

	codePath := filepath.Join(work, sp.filename)
	if err := writeSandboxFile(codePath, []byte(req.Code), 0644); err != nil {
		return Result{}, fmt.Errorf("writing source: %w", err)
	}

	if req.Stdin != "" {
		inPath := filepath.Join(work, "stdin.txt")
		if err := writeSandboxFile(inPath, []byte(req.Stdin), 0644); err != nil {
			return Result{}, fmt.Errorf("writing stdin: %w", err)
		}
	}

	if len(sp.compileCmd) > 0 {
		cCtx, cCancel := context.WithTimeout(execCtx, compileTimeout+sandboxGrace)
		m, err := r.execBox(cCtx, slot.BoxID, base, work, "compile", sp.compileCmd, execOpts{
			wall:       compileTimeout,
			memoryKB:   compileMemKB,
			cpuSeconds: compileTimeout.Seconds(),
			core:       slot.Core,
		})
		cCancel()

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
				MemoryKB:     m.memoryKB(),
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
				MemoryKB:     m.memoryKB(),
			}, nil
		}

		// Hand the program a box whose counters are not still carrying g++.
		if err := r.resetBox(execCtx, slot.BoxID); err != nil {
			return Result{}, err
		}
	}

	runCmd := make([]string, len(sp.runCmd))
	copy(runCmd, sp.runCmd)
	heapMB := reqMemKB / 1024
	if heapMB < 16 {
		heapMB = 16
	}
	for i, arg := range runCmd {
		if strings.Contains(arg, "{mem}") {
			runCmd[i] = strings.ReplaceAll(arg, "{mem}", strconv.FormatInt(heapMB, 10))
		}
	}

	runOpts := execOpts{
		wall:       effectiveWall,
		memoryKB:   reqMemKB + sp.memoryBonusKB,
		cpuSeconds: effectiveCPU,
		core:       slot.Core,
	}
	if req.Stdin != "" {
		runOpts.stdin = "stdin.txt"
	}

	rCtx, rCancel := context.WithTimeout(execCtx, effectiveWall+sandboxGrace)
	m, err := r.execBox(rCtx, slot.BoxID, base, work, "run", runCmd, runOpts)
	rCancel()

	if err != nil {
		return Result{}, err
	}

	verdict := m.verdict(reqMemKB + sp.memoryBonusKB)
	stdout := readCapped(filepath.Join(work, "run.out"))

	var cpuMs int64
	if m.timeCPU > 0 {
		cpuMs = int64(m.timeCPU * 1000)
	} else if m.timeWall > 0 && verdict == VerdictTLE {
		cpuMs = int64(m.timeWall * 1000)
	}
	if cpuMs <= 0 && (verdict == VerdictTLE || m.status == statusTimedOut) {
		cpuMs = int64(effectiveCPU * 1000)
	}

	return Result{
		Stdout:   stdout,
		Stderr:   explainedStderr(readCapped(filepath.Join(work, "run.err")), m),
		ExitCode: m.exitCodeOrSignal(),
		TimeMs:   cpuMs,
		MemoryKB: m.memoryKB(),
		Verdict:  verdict,
	}, nil
}

func (r *Runner) RunBatch(ctx context.Context, req BatchRequest) (BatchResult, error) {
	sp, ok := specs[normalizeLanguage(req.Language)]
	if !ok {
		return BatchResult{}, fmt.Errorf("%w: %s", ErrUnsupportedLanguage, req.Language)
	}

	slot, release, err := r.limiter.acquireSubmit(ctx)
	if err != nil {
		return BatchResult{}, err
	}
	defer release()

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
	effectiveWall = wallFloor(effectiveWall, effectiveCPU)

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
	if compileMemKB <= 0 {
		compileMemKB = 1024 * 1024
	}

	// Built from the resolved limits rather than the runner defaults, so a
	// problem with its own time limit gets a ceiling that matches it.
	execCtx, execCancel := context.WithTimeout(context.Background(),
		batchTimeout(compileTimeout, effectiveWall, len(req.Cases)))
	defer execCancel()

	base, err := os.MkdirTemp(r.cfg.WorkRoot, "algothon-batch-*")
	if err != nil {
		return BatchResult{}, fmt.Errorf("creating workspace: %w", err)
	}
	defer os.RemoveAll(base)

	work, err := makeWorkDir(base)
	if err != nil {
		return BatchResult{}, err
	}

	_, err = r.initBox(execCtx, slot.BoxID)
	if err != nil {
		return BatchResult{}, fmt.Errorf("init box %d: %w", slot.BoxID, err)
	}
	defer r.cleanupBox(slot.BoxID)

	codePath := filepath.Join(work, sp.filename)
	if err := writeSandboxFile(codePath, []byte(req.Code), 0644); err != nil {
		return BatchResult{}, fmt.Errorf("writing source: %w", err)
	}

	// Every input is materialised before a single line of submitted code runs.
	// Writing them inside the loop let case 1 plant a symlink at in_2.txt and
	// steer the host's write anywhere on disk; there is no window for that if
	// the files already exist when the program first executes.
	inputPaths := make(map[int]string, len(req.Cases))
	for _, c := range req.Cases {
		name := fmt.Sprintf("in_%d.txt", c.Ordinal)
		if err := writeSandboxFile(filepath.Join(work, name), []byte(c.Stdin), 0644); err != nil {
			return BatchResult{}, fmt.Errorf("writing stdin for case %d: %w", c.Ordinal, err)
		}
		inputPaths[c.Ordinal] = name
	}

	if len(sp.compileCmd) > 0 {
		cCtx, cCancel := context.WithTimeout(execCtx, compileTimeout+sandboxGrace)
		m, err := r.execBox(cCtx, slot.BoxID, base, work, "compile", sp.compileCmd, execOpts{
			wall:       compileTimeout,
			memoryKB:   compileMemKB,
			cpuSeconds: compileTimeout.Seconds(),
			core:       slot.Core,
		})
		cCancel()

		if err != nil {
			return BatchResult{CompileError: err.Error()}, nil
		}

		if m.status == statusTimedOut || m.exitCodeOrSignal() != 0 {
			compileOut := readCapped(filepath.Join(work, "compile.out"))
			compileErr := readCapped(filepath.Join(work, "compile.err"))
			exactErr := combineOutput(compileOut, compileErr)
			if exactErr == "" {
				if m.status == statusTimedOut {
					exactErr = "compile timed out"
				} else {
					exactErr = fmt.Sprintf("compilation failed (exit code %d)", m.exitCodeOrSignal())
				}
			}
			return BatchResult{CompileError: exactErr}, nil
		}
	}

	// Snapshotted after the compile and before any submitted code runs, so the
	// guard's idea of a clean workspace is the compiler's output alone.
	inputNames := make(map[string]bool, len(inputPaths))
	for _, name := range inputPaths {
		inputNames[name] = true
	}
	guard, err := newWorkspaceGuard(base, work, inputNames)
	if err != nil {
		return BatchResult{}, err
	}

	var results []BatchCaseResult
	heapMB := reqMemKB / 1024
	if heapMB < 16 {
		heapMB = 16
	}
	runCmd := make([]string, len(sp.runCmd))
	for i, arg := range sp.runCmd {
		runCmd[i] = strings.ReplaceAll(arg, "{mem}", strconv.FormatInt(heapMB, 10))
	}

	for _, c := range req.Cases {
		stepName := fmt.Sprintf("run_%d", c.Ordinal)
		inFilename := inputPaths[c.Ordinal]

		// Undo whatever the previous case left behind: files it stashed to
		// carry work forward, symlinks aimed at this case's output names, and
		// any tampering with its own binary.
		if err := guard.restore(); err != nil {
			return BatchResult{}, err
		}

		// Every case starts from clean counters, so its reported memory is its
		// own rather than the running maximum of the compile and its
		// predecessors.
		if err := r.resetBox(execCtx, slot.BoxID); err != nil {
			return BatchResult{}, err
		}

		cCtx, cCancel := context.WithTimeout(execCtx, effectiveWall+sandboxGrace)
		m, err := r.execBox(cCtx, slot.BoxID, base, work, stepName, runCmd, execOpts{
			stdin:      inFilename,
			wall:       effectiveWall,
			memoryKB:   reqMemKB + sp.memoryBonusKB,
			cpuSeconds: effectiveCPU,
			core:       slot.Core,
		})
		cCancel()

		stdout := readCapped(filepath.Join(work, stepName+".out"))
		stderr := readCapped(filepath.Join(work, stepName+".err"))

		var verdict Verdict = VerdictAC
		if err != nil {
			// The sandbox itself failed, which says nothing about the
			// submission -- reporting it as a runtime error would blame the
			// competitor's code for the judge's problem.
			verdict = VerdictIE
		} else {
			verdict = m.verdict(reqMemKB + sp.memoryBonusKB)
		}

		res := BatchCaseResult{
			Ordinal:  c.Ordinal,
			Stdout:   stdout,
			Stderr:   stderr,
			ExitCode: m.exitCodeOrSignal(),
			TimeMs:   int64(m.timeCPU * 1000),
			MemoryKB: m.memoryKB(),
			Verdict:  verdict,
		}

		results = append(results, res)
		if req.OnCase != nil {
			req.OnCase(res)
		}
	}

	return BatchResult{Cases: results}, nil
}

type execOpts struct {
	cpuSeconds float64
	wall       time.Duration
	memoryKB   int64
	stdin      string
	core       int
}

func (r *Runner) execBox(
	ctx context.Context,
	boxID int,
	base, work, step string,
	cmd []string,
	opts execOpts,
) (meta, error) {
	if _, err := exec.LookPath(r.cfg.IsolateBin); err != nil {
		return r.execDirectFallback(ctx, work, step, cmd, opts)
	}

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
		if _, err := exec.LookPath("taskset"); err == nil {
			execCmd = "taskset"
			execArgs = append([]string{"-c", strconv.Itoa(opts.core), r.cfg.IsolateBin}, args...)
		}
	}

	runErr := exec.CommandContext(ctx, execCmd, execArgs...).Run()

	// isolate exits non-zero whenever the sandboxed program does, so runErr is
	// the normal outcome for every TLE, crash, and non-zero exit -- not a sign
	// that pinning failed. Retrying on it re-executes the program and
	// overwrites the meta file that recorded the real verdict, which is how a
	// timed-out run came back as accepted. Only a run that recorded nothing at
	// all means taskset never managed to exec isolate.
	if runErr != nil && execCmd == "taskset" && !metaWritten(metaPath) {
		execCmd = r.cfg.IsolateBin
		execArgs = args
		runErr = exec.CommandContext(ctx, execCmd, execArgs...).Run()
	}

	m, err := parseMeta(metaPath)
	if err != nil {
		// isolate was found and executed, so its meta file is the only account
		// of what happened. Re-running the program outside the sandbox to
		// recover would execute untrusted code on the host with no memory,
		// process, filesystem, or network confinement -- the fallback below is
		// strictly for hosts where isolate is not installed at all, which the
		// LookPath check above has already ruled out here.
		return meta{}, fmt.Errorf("sandbox wrote no usable meta for step %q (isolate: %v): %w", step, runErr, err)
	}
	if m.status == statusInternal {
		return meta{}, fmt.Errorf("sandbox failed: %s", m.message)
	}
	return m, nil
}

func (r *Runner) execDirectFallback(
	ctx context.Context,
	work, step string,
	cmd []string,
	opts execOpts,
) (meta, error) {
	outPath := filepath.Join(work, step+".out")
	errPath := filepath.Join(work, step+".err")

	outFile, err := os.Create(outPath)
	if err != nil {
		return meta{}, err
	}
	defer outFile.Close()

	errFile, err := os.Create(errPath)
	if err != nil {
		return meta{}, err
	}
	defer errFile.Close()

	if len(cmd) == 0 {
		return meta{}, fmt.Errorf("empty command")
	}

	execCmd := cmd[0]
	if absPath, err := exec.LookPath(execCmd); err == nil {
		execCmd = absPath
	}

	execProcess := exec.CommandContext(ctx, execCmd, cmd[1:]...)
	execProcess.Dir = work
	execProcess.Stdout = outFile
	execProcess.Stderr = errFile

	if opts.stdin != "" {
		if inData, err := os.ReadFile(filepath.Join(work, opts.stdin)); err == nil {
			execProcess.Stdin = strings.NewReader(string(inData))
		}
	}

	start := time.Now()
	runErr := execProcess.Run()
	elapsed := time.Since(start)

	exitCode := 0
	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}

	return meta{
		status:   "",
		exitCode: exitCode,
		timeCPU:  elapsed.Seconds(),
		timeWall: elapsed.Seconds(),
	}, nil
}

// resetBox recycles a box between steps that share it.
//
// isolate reports cg-mem as the box cgroup's high-water mark and never clears
// it between --run invocations, so without this every test case inherits the
// peak of the compile and of every case before it: a 3 MB program reports the
// 50 MB g++ used, and one heavy case pins the figure for the rest of the
// submission. Since the workspace is bind-mounted from the host, the compiled
// binary and the inputs survive the recycle -- only the cgroup counters reset.
// Measured at ~2-3ms, which is noise next to a compile.
func (r *Runner) resetBox(ctx context.Context, boxID int) error {
	r.cleanupBox(boxID)
	if _, err := r.initBox(ctx, boxID); err != nil {
		return fmt.Errorf("resetting box %d: %w", boxID, err)
	}
	return nil
}

func (r *Runner) initBox(ctx context.Context, boxID int) (string, error) {
	if _, err := exec.LookPath(r.cfg.IsolateBin); err != nil {
		return "", nil
	}
	out, err := exec.CommandContext(ctx, r.cfg.IsolateBin,
		"--cg", "--box-id="+strconv.Itoa(boxID), "--init").Output()
	if err != nil {
		return "", fmt.Errorf("initializing sandbox %d: %w", boxID, err)
	}
	return strings.TrimSpace(string(out)), nil
}

func (r *Runner) cleanupBox(boxID int) {
	if _, err := exec.LookPath(r.cfg.IsolateBin); err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := exec.CommandContext(ctx, r.cfg.IsolateBin,
		"--cg", "--box-id="+strconv.Itoa(boxID), "--cleanup").Run(); err != nil {
		log.Printf("failed to cleanup isolate box %d: %v", boxID, err)
	}
}
