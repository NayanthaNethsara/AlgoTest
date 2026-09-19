package judge

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestSubmissionLimitsUsesProblemBudget(t *testing.T) {
	l := submissionLimits(Submission{TimeLimitMS: 4000, MemoryLimitMB: 256})

	if l.CPUSeconds != 4 {
		t.Errorf("CPUSeconds = %v, want 4", l.CPUSeconds)
	}
	if l.MemoryKB != 256*1024 {
		t.Errorf("MemoryKB = %d, want %d", l.MemoryKB, 256*1024)
	}
	// The runner scales CPU per language (Python 3x) but not wall time, so the
	// backstop has to clear the scaled budget or it decides TLE instead.
	if l.Wall <= 3*time.Duration(l.CPUSeconds)*time.Second {
		t.Errorf("Wall = %v, must exceed 3x the CPU budget", l.Wall)
	}
}

func TestSubmissionLimitsFallsBackToServerDefaults(t *testing.T) {
	l := submissionLimits(Submission{})

	if l.CPUSeconds != 0 || l.Wall != 0 || l.MemoryKB != 0 {
		t.Errorf("a problem declaring nothing must leave limits zero, got %+v", l)
	}
}

func TestTestCacheReadsSourceOnce(t *testing.T) {
	var calls int
	cache := newTestCache(1024, func(ctx context.Context, problemID string) ([]TestCase, error) {
		calls++
		return []TestCase{{Ordinal: 1, Points: 100}}, nil
	})

	for i := 0; i < 3; i++ {
		tests, release, err := cache.acquire(context.Background(), "p1")
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if len(tests) != 1 || tests[0].Points != 100 {
			t.Fatalf("got %+v", tests)
		}
		release()
	}
	if calls != 1 {
		t.Errorf("source called %d times, want 1", calls)
	}

	cache.invalidate("p1")
	if _, release, err := cache.acquire(context.Background(), "p1"); err != nil {
		t.Fatalf("get after invalidate: %v", err)
	} else {
		release()
	}
	if calls != 2 {
		t.Errorf("source called %d times after invalidate, want 2", calls)
	}
}

func TestTestCacheDoesNotCacheErrors(t *testing.T) {
	var calls int
	cache := newTestCache(1024, func(ctx context.Context, problemID string) ([]TestCase, error) {
		calls++
		return nil, ErrNoTestCases
	})

	for i := 0; i < 2; i++ {
		if _, _, err := cache.acquire(context.Background(), "p1"); !errors.Is(err, ErrNoTestCases) {
			t.Fatalf("err = %v, want ErrNoTestCases", err)
		}
	}
	if calls != 2 {
		t.Errorf("source called %d times, want 2: an organiser adding the missing tests must take effect", calls)
	}
}

func TestTestCacheIsConcurrencySafe(t *testing.T) {
	cache := newTestCache(1024, func(ctx context.Context, problemID string) ([]TestCase, error) {
		return []TestCase{{Ordinal: 1}}, nil
	})

	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if _, release, err := cache.acquire(context.Background(), "p1"); err != nil {
				t.Errorf("get: %v", err)
			} else {
				release()
			}
			if i%4 == 0 {
				cache.invalidate("p1")
			}
		}(i)
	}
	wg.Wait()
}

func TestBroadcastIsScopedToOneUser(t *testing.T) {
	b := NewBroadcaster(nil, nil)
	mine, unsubscribe := b.Subscribe("user-1")
	defer unsubscribe()

	b.Broadcast(Result{SubmissionID: "s2", UserID: "user-2"})
	b.Broadcast(Result{SubmissionID: "s1", UserID: "user-1"})

	select {
	case got := <-mine:
		if got.SubmissionID != "s1" {
			t.Errorf("received %q: another user's submission leaked", got.SubmissionID)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for submission")
	}
}

func TestTestCacheReturnsCloneToPreventMutation(t *testing.T) {
	cache := newTestCache(1024, func(ctx context.Context, problemID string) ([]TestCase, error) {
		return []TestCase{{Ordinal: 1, Points: 10, Input: []byte("input"), Expected: []byte("answer")}}, nil
	})

	tests1, release1, err := cache.acquire(context.Background(), "p1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer release1()
	tests1[0].Points = 999

	tests2, release2, err := cache.acquire(context.Background(), "p1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer release2()
	if &tests1[0].Input[0] != &tests2[0].Input[0] || &tests1[0].Expected[0] != &tests2[0].Expected[0] {
		t.Fatal("test payloads were copied")
	}
	if tests2[0].Points != 10 {
		t.Errorf("cache was mutated in-place: got Points=%d, want 10", tests2[0].Points)
	}
}

func TestTestCacheBudgetAndActiveSharing(t *testing.T) {
	calls := make(map[string]int)
	cache := newTestCache(4, func(_ context.Context, id string) ([]TestCase, error) {
		calls[id]++
		return []TestCase{{Input: []byte(id), Expected: []byte("abc")}}, nil
	})
	get := func(id string) func() {
		t.Helper()
		_, release, err := cache.acquire(context.Background(), id)
		if err != nil {
			t.Fatal(err)
		}
		return release
	}
	get("a")()
	get("b")()
	get("a")()
	if calls["a"] != 2 {
		t.Fatal("idle suite was not evicted")
	}
	release := get("oversized")
	get("oversized")()
	if calls["oversized"] != 1 {
		t.Fatal("active suite was loaded twice")
	}
	release()
	if cache.bytes > cache.maxBytes {
		t.Fatal("released suite exceeds budget")
	}
	get("oversized")()
	if calls["oversized"] != 2 {
		t.Fatal("oversized suite retained after release")
	}
}

func TestTestCacheInvalidationDuringLoad(t *testing.T) {
	for _, clearAll := range []bool{false, true} {
		started, proceed := make(chan struct{}), make(chan struct{})
		calls := 0
		cache := newTestCache(1024, func(_ context.Context, _ string) ([]TestCase, error) {
			calls++
			if calls == 1 {
				close(started)
				<-proceed
			}
			return []TestCase{{Points: calls}}, nil
		})
		done := make(chan struct{})
		go func() {
			defer close(done)
			tests, release, err := cache.acquire(context.Background(), "p")
			if err != nil {
				t.Error(err)
				return
			}
			defer release()
			if tests[0].Points != 2 {
				t.Error("stale load was published")
			}
		}()
		<-started
		if clearAll {
			cache.clear()
		} else {
			cache.invalidate("p")
		}
		close(proceed)
		<-done
	}
}

func TestTestCacheCanceledLoaderCanBeRetried(t *testing.T) {
	started := make(chan struct{})
	calls := 0
	cache := newTestCache(1024, func(ctx context.Context, _ string) ([]TestCase, error) {
		calls++
		if calls == 1 {
			close(started)
			<-ctx.Done()
			return nil, ctx.Err()
		}
		return []TestCase{{Points: 100}}, nil
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() {
		_, _, err := cache.acquire(ctx, "p")
		done <- err
	}()
	<-started
	retried := make(chan error, 1)
	go func() {
		_, release, err := cache.acquire(context.Background(), "p")
		if err == nil {
			release()
		}
		retried <- err
	}()
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("loader: %v", err)
	}
	if err := <-retried; err != nil {
		t.Fatalf("other submission: %v", err)
	}
	if calls != 2 {
		t.Fatalf("got %d source calls", calls)
	}
}

func TestTestCacheConcurrentMissesAndCancellation(t *testing.T) {
	started, proceed := make(chan struct{}), make(chan struct{})
	calls := 0
	cache := newTestCache(1024, func(_ context.Context, _ string) ([]TestCase, error) {
		calls++
		if calls == 1 {
			close(started)
		}
		<-proceed
		return []TestCase{{Input: []byte("input")}}, nil
	})
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, release, err := cache.acquire(context.Background(), "p")
			if err != nil {
				t.Error(err)
				return
			}
			release()
		}()
	}
	<-started
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := cache.acquire(ctx, "p"); !errors.Is(err, context.Canceled) {
		t.Errorf("cancellation: %v", err)
	}
	close(proceed)
	wg.Wait()
	if calls != 1 {
		t.Fatalf("loaded %d times", calls)
	}
	cache.byID["p"].expires = time.Now().Add(-time.Second)
	_, release, err := cache.acquire(context.Background(), "p")
	if err != nil {
		t.Fatal(err)
	}
	release()
	if calls != 2 {
		t.Fatal("missed notification fallback did not refresh")
	}
}

func BenchmarkTestCacheAcquire(b *testing.B) {
	for _, size := range []int{1024, 20 * 1024 * 1024} {
		name := "1KiB"
		if size > 1024 {
			name = "20MiB"
		}
		b.Run(name, func(b *testing.B) {
			payload := make([]byte, size)
			cache := newTestCache(2<<30, func(context.Context, string) ([]TestCase, error) {
				tests := make([]TestCase, 46)
				for i := range tests {
					tests[i].Input = payload
				}
				return tests, nil
			})
			_, release, _ := cache.acquire(context.Background(), "p")
			release()
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, release, err := cache.acquire(context.Background(), "p")
				if err != nil {
					b.Fatal(err)
				}
				release()
			}
		})
	}
}

func TestNormalizeOutput(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"crlf", "a\r\nb\r\n", "a\nb"},
		{"lone cr", "a\rb", "a\nb"},
		{"trailing spaces per line", "a   \nb\t\t\n", "a\nb"},
		{"leading and trailing blank lines", "\n\n  a  \n\n", "a"},
		{"all whitespace", " \t\r\n ", ""},
		{"empty", "", ""},
		{"interior blank line kept", "a\n\nb", "a\n\nb"},
		{"interior spacing kept", "1 2 3", "1 2 3"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := normalizeOutput(c.in); got != c.want {
				t.Errorf("normalizeOutput(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestNormalizeOutputMatchesAcrossLineEndings(t *testing.T) {
	if normalizeOutput("1\r\n2\r\n3\r\n") != normalizeOutput("1\n2\n3") {
		t.Error("a CRLF answer must compare equal to the same LF answer")
	}
}

func TestResolveTestPointsSplitsUnweightedEvenly(t *testing.T) {
	tests := []TestCase{{Ordinal: 1}, {Ordinal: 2}, {Ordinal: 3}}
	max := resolveTestPoints(tests, 100)
	if max != 100 {
		t.Fatalf("maxScore = %d, want 100", max)
	}
	sum := 0
	for _, tc := range tests {
		sum += tc.Points
	}
	if sum != 100 {
		t.Errorf("distributed points sum = %d, want 100", sum)
	}
	if tests[0].Points != 34 || tests[1].Points != 33 || tests[2].Points != 33 {
		t.Errorf("remainder not front-loaded: got %d/%d/%d", tests[0].Points, tests[1].Points, tests[2].Points)
	}
}

func TestResolveTestPointsKeepsCustomWeights(t *testing.T) {
	tests := []TestCase{{Ordinal: 1, Points: 70}, {Ordinal: 2, Points: 30}}
	if max := resolveTestPoints(tests, 100); max != 100 {
		t.Fatalf("maxScore = %d, want 100", max)
	}
	if tests[0].Points != 70 || tests[1].Points != 30 {
		t.Errorf("custom weights were overwritten: got %d/%d", tests[0].Points, tests[1].Points)
	}
}

func TestResolveTestPointsFallsBackWhenNothingDeclared(t *testing.T) {
	tests := []TestCase{{Ordinal: 1}, {Ordinal: 2}}
	if max := resolveTestPoints(tests, 0); max != 100 {
		t.Errorf("maxScore = %d, want the 100 fallback", max)
	}
}

func TestSubmissionStatus(t *testing.T) {
	cases := []struct {
		verdict string
		score   int
		want    Status
	}{
		{"AC", 100, StatusPassed},
		{"AC", 0, StatusPassed},
		{"WA", 40, StatusPassed},
		{"WA", 0, StatusFailed},
		{"TLE", 0, StatusFailed},
		{"CE", 0, StatusFailed},
	}
	for _, c := range cases {
		if got := submissionStatus(c.verdict, c.score); got != c.want {
			t.Errorf("submissionStatus(%q, %d) = %q, want %q", c.verdict, c.score, got, c.want)
		}
	}
}

func TestNewResultCarriesIdentity(t *testing.T) {
	s := Submission{ID: "sub-1", UserID: "u-1", TeamID: "t-1", ProblemID: "p-1"}
	res := newResult(s, StatusFailed, "IE")
	if res.SubmissionID != "sub-1" || res.UserID != "u-1" || res.TeamID != "t-1" || res.ProblemID != "p-1" {
		t.Errorf("identity fields not carried: %+v", res)
	}
	if res.Status != StatusFailed {
		t.Errorf("Status = %q, want %q", res.Status, StatusFailed)
	}
	if res.Verdict == nil || *res.Verdict != "IE" {
		t.Errorf("Verdict not set to IE")
	}
}

func TestNewResultVerdictsAreNotAliased(t *testing.T) {
	s := Submission{ID: "sub-1"}
	a := newResult(s, StatusFailed, "CE")
	b := newResult(s, StatusPassed, "AC")
	if *a.Verdict != "CE" {
		t.Errorf("first verdict was clobbered by the second: got %q", *a.Verdict)
	}
	if *b.Verdict != "AC" {
		t.Errorf("second verdict wrong: got %q", *b.Verdict)
	}
}
