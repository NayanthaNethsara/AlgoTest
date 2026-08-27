package runner

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
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

func TestMetaVerdict(t *testing.T) {
	cases := []struct {
		name string
		meta meta
		mem  int64
		want Verdict
	}{
		{
			name: "clean exit zero",
			meta: meta{status: "", exitCode: 0},
			want: VerdictAC,
		},
		{
			name: "status timed out",
			meta: meta{status: statusTimedOut},
			want: VerdictTLE,
		},
		{
			name: "sigxcpu signal 24",
			meta: meta{status: statusSignalled, exitSig: 24},
			want: VerdictTLE,
		},
		{
			name: "sigkill signal 9",
			meta: meta{status: statusSignalled, exitSig: 9},
			want: VerdictTLE,
		},
		{
			name: "exit code 128+24",
			meta: meta{status: statusRuntimeError, exitCode: 152},
			want: VerdictTLE,
		},
		{
			name: "message contains time limit",
			meta: meta{status: statusRuntimeError, message: "Time limit exceeded"},
			want: VerdictTLE,
		},
		{
			name: "message contains wall clock",
			meta: meta{status: statusRuntimeError, message: "Wall clock time exceeded"},
			want: VerdictTLE,
		},
		{
			name: "cgroup oom killed",
			meta: meta{cgOOMKilled: true},
			want: VerdictMLE,
		},
		{
			name: "memory limit threshold reached",
			meta: meta{status: statusRuntimeError, exitCode: 1, cgMemKB: 250 * 1024},
			mem:  256 * 1024,
			want: VerdictMLE,
		},
		{
			name: "output limit exceeded signal 25",
			meta: meta{status: statusSignalled, exitSig: 25},
			want: VerdictOLE,
		},
		{
			name: "generic runtime error",
			meta: meta{status: statusRuntimeError, exitCode: 1},
			want: VerdictRTE,
		},
		{
			name: "isolate internal error",
			meta: meta{status: statusInternal},
			want: VerdictIE,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.meta.verdict(tc.mem); got != tc.want {
				t.Errorf("verdict = %v, want %v", got, tc.want)
			}
		})
	}
}

// Every concurrent holder must get a distinct box ID: two runs sharing one
// would collide inside isolate.
func TestLimiterHandsOutDistinctBoxes(t *testing.T) {
	l := newLimiter(3, 0, time.Second, 0, "")
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
	l := newLimiter(1, 1, 50*time.Millisecond, 0, "")
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

func TestRunLanguages(t *testing.T) {
	if os.Getenv("RUN_TEST_ISOLATE") == "" {
		t.Skip("skipping isolate integration test; set RUN_TEST_ISOLATE=1 to run")
	}

	r, err := New(Config{
		CompileTimeout: 10 * time.Second,
		WallTimeout:    5 * time.Second,
		CPUSeconds:     2.0,
		Memory:         "256m",
		MaxConcurrent:  1,
	})
	if err != nil {
		t.Fatalf("New runner: %v", err)
	}

	ctx := context.Background()

	t.Run("cpp", func(t *testing.T) {
		res, err := r.Run(ctx, Request{
			Language: "cpp",
			Code: `#include <iostream>
int main() { std::cout << "Hello C++" << std::endl; return 0; }`,
		})
		if err != nil {
			t.Fatalf("Run cpp failed: %v", err)
		}
		if res.Verdict != VerdictAC {
			t.Errorf("Verdict = %v, want AC (stderr: %q)", res.Verdict, res.Stderr)
		}
	})

	t.Run("python", func(t *testing.T) {
		res, err := r.Run(ctx, Request{
			Language: "python",
			Code:     `print("Hello Python")`,
		})
		if err != nil {
			t.Fatalf("Run python failed: %v", err)
		}
		if res.Verdict != VerdictAC {
			t.Errorf("Verdict = %v, want OK (stderr: %q)", res.Verdict, res.Stderr)
		}
	})
}

// The workspace is writable by the sandboxed program and read back by a judge
// running as root, so any path the program controls is a potential
// arbitrary-read primitive.
func TestReadCappedRefusesSymlinks(t *testing.T) {
	dir := t.TempDir()

	secret := filepath.Join(dir, "secret")
	if err := os.WriteFile(secret, []byte("host-only data"), 0o600); err != nil {
		t.Fatal(err)
	}

	link := filepath.Join(dir, "run.out")
	if err := os.Symlink(secret, link); err != nil {
		t.Fatal(err)
	}
	if got := readCapped(link); got != "" {
		t.Errorf("readCapped followed a symlink and returned %q", got)
	}

	// A regular file at the same name still reads normally.
	if err := os.Remove(link); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(link, []byte("program output"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := readCapped(link); got != "program output" {
		t.Errorf("readCapped = %q, want %q", got, "program output")
	}
}

// The judge writes test inputs as root, so a symlink left at an input's name
// would redirect that write anywhere on the host filesystem.
func TestWriteSandboxFileRefusesSymlinks(t *testing.T) {
	dir := t.TempDir()

	target := filepath.Join(dir, "victim")
	if err := os.WriteFile(target, []byte("original"), 0o644); err != nil {
		t.Fatal(err)
	}

	link := filepath.Join(dir, "in_2.txt")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}

	if err := writeSandboxFile(link, []byte("test case input"), 0o644); err != nil {
		t.Fatalf("writeSandboxFile: %v", err)
	}

	victim, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(victim) != "original" {
		t.Errorf("symlink target was overwritten with %q", victim)
	}

	written, err := os.ReadFile(link)
	if err != nil {
		t.Fatal(err)
	}
	if string(written) != "test case input" {
		t.Errorf("wrote %q to the intended path, want %q", written, "test case input")
	}
	if fi, err := os.Lstat(link); err != nil || fi.Mode()&os.ModeSymlink != 0 {
		t.Error("path should have been replaced by a regular file")
	}
}

// End to end: a submission that plants symlinks over the judge's own files
// must not be able to read host state through them.
func TestRunBatchResistsSymlinkPlanting(t *testing.T) {
	if os.Getenv("RUN_TEST_ISOLATE") == "" {
		t.Skip("skipping isolate integration test; set RUN_TEST_ISOLATE=1 to run")
	}

	r, err := New(Config{
		CompileTimeout: 20 * time.Second,
		WallTimeout:    5 * time.Second,
		CPUSeconds:     2.0,
		Memory:         "256m",
		MaxConcurrent:  1,
	})
	if err != nil {
		t.Fatalf("New runner: %v", err)
	}

	res, err := r.RunBatch(context.Background(), BatchRequest{
		Language: "cpp",
		// Case 1 attacks; case 2 behaves, so the run also proves the judge
		// recovers the next case instead of inheriting the planted symlink.
		Code: `#include <bits/stdc++.h>
#include <unistd.h>
int main() {
    int n; std::cin >> n;
    std::cout << n << std::endl;
    std::cout.flush();
    if (n == 1) {
        // Aim the judge's own files at host state before exiting.
        unlink("/sandbox/run_1.out");
        if (symlink("/etc/shadow", "/sandbox/run_1.out")) { /* best effort */ }
        unlink("/sandbox/run_2.out");
        if (symlink("/etc/shadow", "/sandbox/run_2.out")) { /* best effort */ }
    }
    return 0;
}`,
		Cases: []BatchCase{{Ordinal: 1, Stdin: "1\n"}, {Ordinal: 2, Stdin: "2\n"}},
	})
	if err != nil {
		t.Fatalf("RunBatch: %v", err)
	}
	if res.CompileError != "" {
		t.Fatalf("compile error: %s", res.CompileError)
	}

	for _, c := range res.Cases {
		if strings.Contains(c.Stdout, "root:") || strings.Contains(c.Stderr, "root:") {
			t.Errorf("case %d leaked host file contents: stdout=%q stderr=%q",
				c.Ordinal, c.Stdout, c.Stderr)
		}
	}
	// The second case must still be judged on its own real output.
	if len(res.Cases) == 2 && strings.TrimSpace(res.Cases[1].Stdout) != "2" {
		t.Errorf("case 2 stdout = %q, want \"2\"", res.Cases[1].Stdout)
	}
}

// A submission must not be able to carry state between test cases: stashing an
// answer computed inside case 1's time limit and serving it in case 2 defeats
// per-test limits, and the same persistence is what leaves symlinks lying
// around for later steps.
func TestRunBatchIsolatesCasesFromEachOther(t *testing.T) {
	if os.Getenv("RUN_TEST_ISOLATE") == "" {
		t.Skip("skipping isolate integration test; set RUN_TEST_ISOLATE=1 to run")
	}

	r, err := New(Config{
		CompileTimeout: 20 * time.Second,
		WallTimeout:    5 * time.Second,
		CPUSeconds:     2.0,
		Memory:         "256m",
		MaxConcurrent:  1,
	})
	if err != nil {
		t.Fatalf("New runner: %v", err)
	}

	// Each case reports whether the previous one's stash survived.
	res, err := r.RunBatch(context.Background(), BatchRequest{
		Language: "cpp",
		Code: `#include <bits/stdc++.h>
int main() {
    std::ifstream in("carried.txt");
    std::string carried;
    std::cout << (in && std::getline(in, carried) ? "CARRIED" : "CLEAN") << std::endl;
    std::ofstream out("carried.txt");
    out << "state from an earlier case" << std::endl;
}`,
		Cases: []BatchCase{{Ordinal: 1, Stdin: "\n"}, {Ordinal: 2, Stdin: "\n"}, {Ordinal: 3, Stdin: "\n"}},
	})
	if err != nil {
		t.Fatalf("RunBatch: %v", err)
	}
	if res.CompileError != "" {
		t.Fatalf("compile error: %s", res.CompileError)
	}

	for _, c := range res.Cases {
		if got := strings.TrimSpace(c.Stdout); got != "CLEAN" {
			t.Errorf("case %d saw %q: state leaked from the previous case", c.Ordinal, got)
		}
	}
}

// A meta file with no fields means isolate was killed before it could report.
// Parsing it into a zero-value meta would give an empty status, which reads as
// a clean run -- so a sandbox that died must surface as an error instead.
func TestParseMetaRejectsEmptyFile(t *testing.T) {
	dir := t.TempDir()

	empty := filepath.Join(dir, "empty.meta")
	if err := os.WriteFile(empty, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := parseMeta(empty); !errors.Is(err, errEmptyMeta) {
		t.Errorf("parseMeta(empty) error = %v, want errEmptyMeta", err)
	}
	if metaWritten(empty) {
		t.Error("metaWritten must be false for a zero-length file")
	}

	// Truncated-but-present output is still a real report.
	partial := filepath.Join(dir, "partial.meta")
	if err := os.WriteFile(partial, []byte("status:TO\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	m, err := parseMeta(partial)
	if err != nil {
		t.Fatalf("parseMeta(partial): %v", err)
	}
	if m.status != statusTimedOut {
		t.Errorf("status = %q, want %q", m.status, statusTimedOut)
	}
	if !metaWritten(partial) {
		t.Error("metaWritten must be true for a file with content")
	}
}

// Regression: isolate exits non-zero whenever the sandboxed program does, so
// treating that as a taskset failure re-ran the program and overwrote the meta
// file holding the real verdict. A timed-out run came back as accepted.
func TestRunTimeoutIsNotReportedAsAccepted(t *testing.T) {
	if os.Getenv("RUN_TEST_ISOLATE") == "" {
		t.Skip("skipping isolate integration test; set RUN_TEST_ISOLATE=1 to run")
	}

	r, err := New(Config{
		CompileTimeout: 10 * time.Second,
		WallTimeout:    3 * time.Second,
		CPUSeconds:     1.0,
		Memory:         "256m",
		MaxConcurrent:  1,
	})
	if err != nil {
		t.Fatalf("New runner: %v", err)
	}

	for _, tc := range []struct{ name, lang, code string }{
		{"cpu loop", "python", "x=0\nwhile True:\n  x+=1"},
		{"sleeping", "python", "import time\ntime.sleep(60)"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res, err := r.Run(context.Background(), Request{Language: tc.lang, Code: tc.code})
			if err != nil {
				t.Fatalf("Run: %v", err)
			}
			if res.Verdict != VerdictTLE {
				t.Errorf("Verdict = %v, want TLE (exit=%d timeMs=%d stderr=%q)",
					res.Verdict, res.ExitCode, res.TimeMs, res.Stderr)
			}
		})
	}
}

// isolate reports two memory figures that each miss something the other
// catches, so the reported number is the larger of the pair.
func TestMemoryKBTakesLargerSource(t *testing.T) {
	// A small program: cg-mem misses binary pages charged to the compile.
	if got := (meta{cgMemKB: 316, maxRSSKB: 3300}).memoryKB(); got != 3300 {
		t.Errorf("memoryKB = %d, want 3300 (max-rss)", got)
	}
	// Several processes: the cgroup sums them, max-rss only sees the largest.
	if got := (meta{cgMemKB: 200000, maxRSSKB: 105748}).memoryKB(); got != 200000 {
		t.Errorf("memoryKB = %d, want 200000 (cg-mem)", got)
	}
	if got := (meta{}).memoryKB(); got != 0 {
		t.Errorf("memoryKB = %d, want 0", got)
	}
}

// A fixed per-submission ceiling cancels the tail of a large test set and
// reports those cases as runtime errors, so the budget has to grow per case.
func TestBatchTimeoutScalesWithCases(t *testing.T) {
	compile, wall := 10*time.Second, 10*time.Second

	one := batchTimeout(compile, wall, 1)
	twenty := batchTimeout(compile, wall, 20)

	if twenty <= one {
		t.Fatalf("20 cases (%v) must allow more than 1 case (%v)", twenty, one)
	}
	// Every case must fit its full wall clock inside the overall budget.
	if min := compile + 20*wall; twenty < min {
		t.Errorf("20-case budget %v is below the %v its cases can use", twenty, min)
	}
	// Zero cases must not produce a zero (instantly-expired) deadline.
	if batchTimeout(compile, wall, 0) < compile {
		t.Error("empty batch budget must still cover a compile")
	}
}

// Regression: isolate never clears a box's cgroup peak between runs, so
// without recycling the box each case inherits the high-water mark of the
// compile and of every earlier case -- a 3 MB program reporting 100 MB.
func TestRunBatchMemoryIsPerCase(t *testing.T) {
	if os.Getenv("RUN_TEST_ISOLATE") == "" {
		t.Skip("skipping isolate integration test; set RUN_TEST_ISOLATE=1 to run")
	}

	r, err := New(Config{
		CompileTimeout: 20 * time.Second,
		WallTimeout:    10 * time.Second,
		CPUSeconds:     5.0,
		Memory:         "256m",
		MaxConcurrent:  1,
	})
	if err != nil {
		t.Fatalf("New runner: %v", err)
	}

	// Case 1 allocates 100 MB, case 2 allocates nothing.
	res, err := r.RunBatch(context.Background(), BatchRequest{
		Language: "cpp",
		Code: `#include <bits/stdc++.h>
int main() {
    int n; if (!(std::cin >> n)) n = 0;
    if (n) { size_t N = 100u<<20; char* p = (char*)malloc(N);
             for (size_t i = 0; i < N; i += 4096) p[i] = 1; }
    std::cout << n << std::endl;
}`,
		Cases: []BatchCase{{Ordinal: 1, Stdin: "1\n"}, {Ordinal: 2, Stdin: "0\n"}},
	})
	if err != nil {
		t.Fatalf("RunBatch: %v", err)
	}
	if res.CompileError != "" {
		t.Fatalf("compile error: %s", res.CompileError)
	}
	if len(res.Cases) != 2 {
		t.Fatalf("got %d cases, want 2", len(res.Cases))
	}

	heavy, light := res.Cases[0].MemoryKB, res.Cases[1].MemoryKB
	if heavy < 90*1024 {
		t.Errorf("case allocating 100 MB reported %d KB, want >= 90 MB", heavy)
	}
	if light >= heavy/2 {
		t.Errorf("case allocating nothing reported %d KB against the heavy case's %d KB: "+
			"the box's peak is leaking across cases", light, heavy)
	}
}

func TestCPUListParsing(t *testing.T) {
	cores := parseCPUList("3-6,8,10-11", 10)
	expected := []int{3, 4, 5, 6, 8, 10, 11}
	if len(cores) != len(expected) {
		t.Fatalf("parseCPUList length = %d, want %d", len(cores), len(expected))
	}
	for i, c := range cores {
		if c != expected[i] {
			t.Errorf("core[%d] = %d, want %d", i, c, expected[i])
		}
	}
}

func TestRequireIsolateBlocksUnsandboxedExecution(t *testing.T) {
	r, err := New(Config{
		CompileTimeout: time.Second,
		WallTimeout:    time.Second,
		CPUSeconds:     1.0,
		Memory:         "256m",
		IsolateBin:     "nonexistent-isolate-binary-for-test",
		RequireIsolate: true,
		WorkRoot:       t.TempDir(),
	})
	if err != nil {
		t.Fatalf("New runner: %v", err)
	}

	err = r.CheckHost(context.Background())
	if err == nil {
		t.Fatal("CheckHost should have failed when RequireIsolate=true and isolate binary is missing")
	}

	_, err = r.Run(context.Background(), Request{
		Language: "python",
		Code:     "print(1)",
	})
	if err == nil || !errors.Is(err, ErrSandboxUnavailable) {
		t.Fatalf("Run expected ErrSandboxUnavailable, got: %v", err)
	}

	batchRes, err := r.RunBatch(context.Background(), BatchRequest{
		Language: "python",
		Code:     "print(1)",
		Cases:    []BatchCase{{Ordinal: 1, Stdin: ""}},
	})
	if err == nil && batchRes.CompileError == "" {
		t.Fatal("RunBatch should have failed when isolate is unavailable with RequireIsolate=true")
	}
}

func TestNormalizeLanguage(t *testing.T) {
	testCases := []struct {
		input string
		want  string
	}{
		{"c", "c"},
		{"C", "c"},
		{"cpp", "cpp"},
		{"c++", "cpp"},
		{"C++", "cpp"},
		{"py", "python"},
		{"python", "python"},
		{"python3", "python"},
		{"java", "java"},
		{"JAVA", "java"},
		{"js", "js"},
		{"javascript", "js"},
		{"node", "js"},
	}

	for _, tc := range testCases {
		got := normalizeLanguage(tc.input)
		if got != tc.want {
			t.Errorf("normalizeLanguage(%q) = %q, want %q", tc.input, got, tc.want)
		}
		if _, ok := specs[got]; !ok {
			t.Errorf("normalized language %q has no corresponding spec in specs map", got)
		}
	}
}
