package runner

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestParseMemoryKB(t *testing.T) {
	cases := []struct {
		in   string
		want int64
	}{
		{"256m", 262144},
		{"1g", 1048576},
		{"512k", 512},
		{"1048576", 1024}, // plain bytes
		{"256M", 262144},  // case-insensitive
	}
	for _, c := range cases {
		got, err := parseMemoryKB(c.in)
		if err != nil {
			t.Errorf("parseMemoryKB(%q) returned error: %v", c.in, err)
			continue
		}
		if got != c.want {
			t.Errorf("parseMemoryKB(%q) = %d, want %d", c.in, got, c.want)
		}
	}

	for _, bad := range []string{"", "abc", "12x", "0", "100"} {
		if _, err := parseMemoryKB(bad); err == nil {
			t.Errorf("parseMemoryKB(%q) should have failed", bad)
		}
	}
}

func TestParseMeta(t *testing.T) {
	path := filepath.Join(t.TempDir(), "meta")
	body := "time:1.234\ntime-wall:2.5\nmax-rss:9000\nstatus:TO\nmessage:Time limit exceeded\nexitsig:9\ncg-oom-killed:1\nfuture-key:ignored\n"
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	m, err := parseMeta(path)
	if err != nil {
		t.Fatalf("parseMeta: %v", err)
	}
	if m.status != statusTimedOut {
		t.Errorf("status = %q, want %q", m.status, statusTimedOut)
	}
	if m.timeWall != 2.5 {
		t.Errorf("timeWall = %v, want 2.5", m.timeWall)
	}
	if m.message != "Time limit exceeded" {
		t.Errorf("message = %q", m.message)
	}
	if !m.cgOOMKilled {
		t.Error("cgOOMKilled should be true")
	}
}

// A signal death must surface as 128+signal, the same shape `docker run`
// produced before, since the API contract exposes ExitCode directly.
func TestExitCodeOrSignal(t *testing.T) {
	sig := meta{status: statusSignalled, exitSig: 9}
	if got := sig.exitCodeOrSignal(); got != 137 {
		t.Errorf("signalled exit code = %d, want 137", got)
	}

	re := meta{status: statusRuntimeError, exitCode: 3}
	if got := re.exitCodeOrSignal(); got != 3 {
		t.Errorf("runtime error exit code = %d, want 3", got)
	}

	if got := (meta{}).exitCodeOrSignal(); got != 0 {
		t.Errorf("clean exit code = %d, want 0", got)
	}
}

// Every concurrent holder must get a distinct box ID: two runs sharing one
// would collide inside isolate.
func TestLimiterHandsOutDistinctBoxes(t *testing.T) {
	l := newLimiter(3, 0, time.Second, 0)
	ctx := context.Background()

	seen := map[int]bool{}
	var releases []func()
	for i := 0; i < 3; i++ {
		id, release, err := l.acquire(ctx)
		if err != nil {
			t.Fatalf("acquire %d: %v", i, err)
		}
		if seen[id] {
			t.Fatalf("box %d handed out twice", id)
		}
		seen[id] = true
		releases = append(releases, release)
	}

	if _, _, err := l.acquire(ctx); err != ErrBusy {
		t.Errorf("over-capacity acquire = %v, want ErrBusy", err)
	}

	releases[0]()
	id, release, err := l.acquire(ctx)
	if err != nil {
		t.Fatalf("acquire after release: %v", err)
	}
	if id < 0 || id > 2 {
		t.Errorf("recycled box ID %d out of range", id)
	}
	release()
}

// A burst beyond running+queued capacity is rejected immediately rather than
// piling up waiter goroutines.
func TestLimiterRejectsBeyondQueue(t *testing.T) {
	l := newLimiter(1, 1, 50*time.Millisecond, 0)
	ctx := context.Background()

	_, release, err := l.acquire(ctx)
	if err != nil {
		t.Fatalf("first acquire: %v", err)
	}
	defer release()

	// One waiter fits in the queue and times out with ErrBusy.
	if _, _, err := l.acquire(ctx); err != ErrBusy {
		t.Errorf("queued waiter = %v, want ErrBusy", err)
	}
}

func TestReadCappedTruncates(t *testing.T) {
	dir := t.TempDir()

	big := filepath.Join(dir, "big")
	if err := os.WriteFile(big, make([]byte, outputLimit*2), 0o644); err != nil {
		t.Fatal(err)
	}
	out := readCapped(big)
	if len(out) <= outputLimit {
		t.Error("truncated output should carry the marker suffix")
	}
	if want := "... (truncated)"; out[len(out)-len(want):] != want {
		t.Errorf("output does not end with %q", want)
	}

	small := filepath.Join(dir, "small")
	if err := os.WriteFile(small, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := readCapped(small); got != "hello" {
		t.Errorf("readCapped = %q, want %q", got, "hello")
	}

	if got := readCapped(filepath.Join(dir, "missing")); got != "" {
		t.Errorf("missing file = %q, want empty", got)
	}
}

func TestFormatSeconds(t *testing.T) {
	cases := map[time.Duration]string{
		10 * time.Second:        "10",
		1500 * time.Millisecond: "1.5",
	}
	for d, want := range cases {
		if got := formatSeconds(d); got != want {
			t.Errorf("formatSeconds(%v) = %q, want %q", d, got, want)
		}
	}
}
