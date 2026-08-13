package runner

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

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
func makeWorkDir(base string) (string, error) {
	work := filepath.Join(base, "work")
	if err := os.MkdirAll(work, 0777); err != nil {
		return "", fmt.Errorf("creating work dir: %w", err)
	}
	if err := os.Chmod(work, 0777); err != nil {
		return "", fmt.Errorf("opening work dir to the sandbox user: %w", err)
	}
	return work, nil
}

// readCapped returns at most outputLimit bytes of a sandbox output file.
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
