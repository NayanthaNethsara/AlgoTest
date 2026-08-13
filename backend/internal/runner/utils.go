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

// writeSandboxFile writes a file into the workspace without ever following a
// symlink the sandboxed program may have planted there.
//
// The judge writes as root, so plain os.WriteFile against a path the program
// controls is an arbitrary-write primitive: a submission that leaves
// /sandbox/in_2.txt pointing at /etc/passwd gets the host to overwrite it with
// the next test case's input. Unlinking first removes the symlink itself
// rather than its target, and O_EXCL|O_NOFOLLOW refuses to reopen anything
// that reappears in between.
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

// clearSandboxFile removes a path the sandboxed program may have replaced with
// a symlink, so the next step starts from a clean name. os.Remove unlinks a
// symlink itself and never touches its target.
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
	case "c", "c++", "cpp":
		return "cpp"
	case "py", "python", "python3":
		return "python"
	case "js", "javascript", "node":
		return "js"
	default:
		return l
	}
}

// makeWorkDir creates the per-run workspace that gets bind-mounted at
// sandboxDir. isolate runs the program as its own box user (uid 60000+box_id),
// not as us, so the directory must be world-writable or the sandbox cannot
// create the redirect targets we pass to --stdout/--stderr, and isolate aborts
// with an internal error before the program ever starts. MkdirAll's mode is
// masked by the umask, so the permissions are set explicitly afterwards.
//
// The sticky bit matters as much as the write bit: without it, write access to
// the directory lets the sandbox unlink or rename files it does not own --
// including the source we compiled and the test inputs we staged, whatever
// their own modes say. With it, as on /tmp, a submission may only remove what
// it created itself.
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

// readCapped returns at most outputLimit bytes of a sandbox output file.
//
// The workspace is writable by the sandboxed program, and we read it back as
// root. A submission whose last act is
//
//	unlink("/sandbox/run_1.out"); symlink("/etc/shadow", "/sandbox/run_1.out");
//
// would otherwise have the host read that file and hand the contents back as
// the program's own output. O_NOFOLLOW refuses the open when the final path
// component is a symlink, and the regular-file check rejects the rest (a fifo
// would block the judge forever, a device would read host state).
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

// newWorkspaceGuard snapshots the workspace once the compile has finished.
// Compile artifacts are copied somewhere the sandbox cannot reach, because they
// belong to the box user and a submission is free to overwrite its own binary
// with one that has answers baked in.
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
		// Test inputs can be large and are not worth duplicating per case: the
		// sticky bit stops the sandbox unlinking them, and a submission that
		// corrupts its own input only earns itself a wrong answer.
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
// back exactly as it was.
func (g *workspaceGuard) restore() error {
	entries, err := os.ReadDir(g.work)
	if err != nil {
		return fmt.Errorf("reading workspace: %w", err)
	}
	for _, e := range entries {
		if !g.expected[e.Name()] {
			// RemoveAll unlinks a symlink itself rather than following it.
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

// copyRegularFile copies src to dst, refusing to follow a symlink at either
// end and preserving the source's permission bits.
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

// wallFloor keeps the wall-clock backstop above the CPU budget it is backing.
//
// The CPU limit is the one a problem's time limit is expressed in, and it is
// scaled per language -- Python gets 3x. The wall limit is not scaled, so with
// the stock 5s CPU limit an interpreted solution is allowed 15s of CPU but only
// 10s of wall, and every slow Python program is judged on the wall clock
// instead: the language factor silently does nothing, and time spent blocked on
// input counts against the limit. The backstop only does its job -- catching a
// program that sleeps without burning CPU -- when it sits above the CPU budget.
func wallFloor(wall time.Duration, cpuSeconds float64) time.Duration {
	min := time.Duration(cpuSeconds*float64(time.Second)) + 2*time.Second
	if wall < min {
		return min
	}
	return wall
}

// explainedStderr falls back to isolate's own account of how a run ended when
// the program itself said nothing. A program killed on the time limit is
// killed mid-execution and never gets to print, so without this the competitor
// sees a blank error alongside a TLE and no indication of why.
func explainedStderr(stderr string, m meta) string {
	if strings.TrimSpace(stderr) != "" || m.message == "" {
		return stderr
	}
	if m.status == "" {
		return stderr
	}
	return m.message
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
