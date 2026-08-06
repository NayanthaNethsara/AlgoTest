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
func (r *Runner) OverallTimeout() time.Duration {
	return r.cfg.CompileTimeout + r.cfg.WallTimeout + 10*time.Second
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

	base, err := os.MkdirTemp("", "algothon-run-*")
	if err != nil {
		return Result{}, fmt.Errorf("creating workspace: %w", err)
	}
	defer os.RemoveAll(base)

	work := filepath.Join(base, "work")
	if err := os.MkdirAll(work, 0755); err != nil {
		return Result{}, fmt.Errorf("creating work dir: %w", err)
	}

	_, err = r.initBox(execCtx, slot.BoxID)
	if err != nil {
		return Result{}, fmt.Errorf("init box %d: %w", slot.BoxID, err)
	}
	defer r.cleanupBox(slot.BoxID)

	codePath := filepath.Join(work, sp.filename)
	if err := os.WriteFile(codePath, []byte(req.Code), 0644); err != nil {
		return Result{}, fmt.Errorf("writing source: %w", err)
	}

	if req.Stdin != "" {
		inPath := filepath.Join(work, "stdin.txt")
		if err := os.WriteFile(inPath, []byte(req.Stdin), 0644); err != nil {
			return Result{}, fmt.Errorf("writing stdin: %w", err)
		}
	}

	if len(sp.compileCmd) > 0 {
		cCtx, cCancel := context.WithTimeout(execCtx, compileTimeout)
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

	rCtx, rCancel := context.WithTimeout(execCtx, effectiveWall)
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
		Stderr:   readCapped(filepath.Join(work, "run.err")),
		ExitCode: m.exitCodeOrSignal(),
		TimeMs:   cpuMs,
		MemoryKB: m.cgMemKB,
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
	if compileMemKB <= 0 {
		compileMemKB = 1024 * 1024
	}

	base, err := os.MkdirTemp("", "algothon-batch-*")
	if err != nil {
		return BatchResult{}, fmt.Errorf("creating workspace: %w", err)
	}
	defer os.RemoveAll(base)

	work := filepath.Join(base, "work")
	if err := os.MkdirAll(work, 0755); err != nil {
		return BatchResult{}, fmt.Errorf("creating work dir: %w", err)
	}

	_, err = r.initBox(execCtx, slot.BoxID)
	if err != nil {
		return BatchResult{}, fmt.Errorf("init box %d: %w", slot.BoxID, err)
	}
	defer r.cleanupBox(slot.BoxID)

	codePath := filepath.Join(work, sp.filename)
	if err := os.WriteFile(codePath, []byte(req.Code), 0644); err != nil {
		return BatchResult{}, fmt.Errorf("writing source: %w", err)
	}

	if len(sp.compileCmd) > 0 {
		cCtx, cCancel := context.WithTimeout(execCtx, compileTimeout)
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
		inFilename := fmt.Sprintf("in_%d.txt", c.Ordinal)
		inPath := filepath.Join(work, inFilename)

		if err := os.WriteFile(inPath, []byte(c.Stdin), 0644); err != nil {
			return BatchResult{}, fmt.Errorf("writing stdin for case %d: %w", c.Ordinal, err)
		}

		cCtx, cCancel := context.WithTimeout(execCtx, effectiveWall)
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
			verdict = VerdictRE
		} else {
			verdict = m.verdict(reqMemKB + sp.memoryBonusKB)
		}

		res := BatchCaseResult{
			Ordinal:  c.Ordinal,
			Stdout:   stdout,
			Stderr:   stderr,
			ExitCode: m.exitCodeOrSignal(),
			TimeMs:   int64(m.timeCPU * 1000),
			MemoryKB: m.cgMemKB,
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
		execCmd = "taskset"
		execArgs = append([]string{"-c", strconv.Itoa(opts.core), r.cfg.IsolateBin}, args...)
	}

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

func (r *Runner) cleanupBox(boxID int) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := exec.CommandContext(ctx, r.cfg.IsolateBin,
		"--cg", "--box-id="+strconv.Itoa(boxID), "--cleanup").Run(); err != nil {
		log.Printf("failed to cleanup isolate box %d: %v", boxID, err)
	}
}
