package runner

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// The judge writes as root, so a symlink the sandbox plants at this path would
// redirect the write anywhere on the host.
func writeSandboxFile(path string, data []byte, perm os.FileMode) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("clearing %s: %w", filepath.Base(path), err)
	}

	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscall.O_NOFOLLOW, perm)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

func clearSandboxFile(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("clearing %s: %w", filepath.Base(path), err)
	}
	return nil
}

// normalizeLanguage converts language aliases to standard internal identifiers.
func normalizeLanguage(lang string) string {
	l := strings.ToLower(strings.TrimSpace(lang))
	switch l {
	case "c":
		return "c"
	case "c++", "cpp":
		return "cpp"
	case "py", "python", "python3":
		return "python"
	case "java":
		return "java"
	case "js", "javascript", "node":
		return "js"
	default:
		return l
	}
}

// isolate runs the program as its own box user, so the workspace must be
// writable by it. The sticky bit stops that user unlinking files it does not
// own; Chmod is explicit because MkdirAll's mode is masked by the umask.
func makeWorkDir(base string) (string, error) {
	const mode = 0777 | os.ModeSticky

	work := filepath.Join(base, "work")
	if err := os.MkdirAll(work, mode); err != nil {
		return "", fmt.Errorf("creating work dir: %w", err)
	}
	if err := os.Chmod(work, mode); err != nil {
		return "", fmt.Errorf("opening work dir to the sandbox user: %w", err)
	}
	return work, nil
}

// readCapped returns at most outputLimit bytes of a sandbox output file. It
// reads as root, so a symlink the sandbox plants here would otherwise leak any
// host file back as the program's own output.
func readCapped(path string) string {
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return ""
	}
	defer f.Close()

	if fi, err := f.Stat(); err != nil || !fi.Mode().IsRegular() {
		return ""
	}

	data, err := io.ReadAll(io.LimitReader(f, outputLimit+1))
	if err != nil {
		return ""
	}
	if len(data) > outputLimit {
		return string(data[:outputLimit]) + "\n... (truncated)"
	}
	return string(data)
}

// workspaceGuard restores the workspace to its post-compile state between test
// cases.
//
// The sandbox writes into a directory that outlives each case, which lets one
// submission carry state across the test set: compute an answer during case 1,
// stash it in a file, and serve it inside case 5's time limit. The same
// persistence is how a case can leave a symlink lying at a name a later step
// uses. Restoring the directory makes every case start from what the compiler
// produced and nothing else.
type workspaceGuard struct {
	work     string
	pristine string          // outside the sandbox mount, so submissions cannot reach it
	expected map[string]bool // names legitimately present after the compile
}

// newWorkspaceGuard snapshots the workspace after the compile. Artifacts are
// copied out of the sandbox's reach because they belong to the box user, which
// is free to overwrite its own binary between cases.
func newWorkspaceGuard(base, work string, keepInPlace map[string]bool) (*workspaceGuard, error) {
	entries, err := os.ReadDir(work)
	if err != nil {
		return nil, fmt.Errorf("reading workspace: %w", err)
	}

	g := &workspaceGuard{
		work:     work,
		pristine: filepath.Join(base, "pristine"),
		expected: make(map[string]bool, len(entries)),
	}
	if err := os.MkdirAll(g.pristine, 0700); err != nil {
		return nil, fmt.Errorf("creating pristine dir: %w", err)
	}

	for _, e := range entries {
		name := e.Name()
		g.expected[name] = true
		// Inputs stay put: they can be large, and the sticky bit protects them.
		if keepInPlace[name] || !e.Type().IsRegular() {
			continue
		}
		if err := copyRegularFile(filepath.Join(work, name), filepath.Join(g.pristine, name)); err != nil {
			return nil, err
		}
	}
	return g, nil
}

// restore deletes anything the submission created and puts the compile output
// back.
func (g *workspaceGuard) restore() error {
	entries, err := os.ReadDir(g.work)
	if err != nil {
		return fmt.Errorf("reading workspace: %w", err)
	}
	for _, e := range entries {
		if !g.expected[e.Name()] {
			if err := os.RemoveAll(filepath.Join(g.work, e.Name())); err != nil {
				return fmt.Errorf("clearing %s: %w", e.Name(), err)
			}
		}
	}

	saved, err := os.ReadDir(g.pristine)
	if err != nil {
		return fmt.Errorf("reading pristine dir: %w", err)
	}
	for _, e := range saved {
		src := filepath.Join(g.pristine, e.Name())
		dst := filepath.Join(g.work, e.Name())
		if err := clearSandboxFile(dst); err != nil {
			return err
		}
		if err := copyRegularFile(src, dst); err != nil {
			return err
		}
	}
	return nil
}

func copyRegularFile(src, dst string) error {
	in, err := os.OpenFile(src, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return fmt.Errorf("opening %s: %w", filepath.Base(src), err)
	}
	defer in.Close()

	fi, err := in.Stat()
	if err != nil || !fi.Mode().IsRegular() {
		return fmt.Errorf("%s is not a regular file", filepath.Base(src))
	}

	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscall.O_NOFOLLOW, fi.Mode().Perm())
	if err != nil {
		return fmt.Errorf("creating %s: %w", filepath.Base(dst), err)
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return fmt.Errorf("copying %s: %w", filepath.Base(src), err)
	}
	return out.Close()
}

// wallFloor keeps the wall backstop above the CPU budget. The CPU limit is
// scaled per language and the wall limit is not, so without this an
// interpreted solution is judged on the wall clock instead of its real limit.
func wallFloor(wall time.Duration, cpuSeconds float64) time.Duration {
	min := time.Duration(cpuSeconds*float64(time.Second)) + 2*time.Second
	if wall < min {
		return min
	}
	return wall
}

func explainedStderr(stderr string, m meta) string {
	if strings.TrimSpace(stderr) != "" {
		return stderr
	}
	if m.message != "" {
		return m.message
	}
	if m.status == statusTimedOut {
		return "Time limit exceeded"
	}
	if m.cgOOMKilled {
		return "Memory limit exceeded"
	}
	if m.status == statusSignalled {
		if m.exitSig == 24 || m.exitSig == 9 {
			return "Time limit exceeded"
		}
		if m.exitSig == 25 {
			return "Output limit exceeded"
		}
		if m.exitSig > 0 {
			return fmt.Sprintf("Process terminated by signal %d", m.exitSig)
		}
	}
	if m.status == statusRuntimeError && m.exitCode != 0 {
		return fmt.Sprintf("Process exited with status code %d", m.exitCode)
	}
	return ""
}

// formatSeconds renders a duration for isolate's fractional-second time flags.
func formatSeconds(d time.Duration) string {
	return strconv.FormatFloat(d.Seconds(), 'f', -1, 64)
}

// parseMemoryKB converts a Docker-style size ("256m", "1g", "512k", or plain bytes) into kilobytes.
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
