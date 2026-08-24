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
	cache := newTestCache(func(ctx context.Context, problemID string) ([]TestCase, error) {
		calls++
		return []TestCase{{Ordinal: 1, Points: 100}}, nil
	})

	for i := 0; i < 3; i++ {
		tests, err := cache.get(context.Background(), "p1")
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if len(tests) != 1 || tests[0].Points != 100 {
			t.Fatalf("got %+v", tests)
		}
	}
	if calls != 1 {
		t.Errorf("source called %d times, want 1", calls)
	}

	cache.invalidate("p1")
	if _, err := cache.get(context.Background(), "p1"); err != nil {
		t.Fatalf("get after invalidate: %v", err)
	}
	if calls != 2 {
		t.Errorf("source called %d times after invalidate, want 2", calls)
	}
}

func TestTestCacheDoesNotCacheErrors(t *testing.T) {
	var calls int
	cache := newTestCache(func(ctx context.Context, problemID string) ([]TestCase, error) {
		calls++
		return nil, ErrNoTestCases
	})

	for i := 0; i < 2; i++ {
		if _, err := cache.get(context.Background(), "p1"); !errors.Is(err, ErrNoTestCases) {
			t.Fatalf("err = %v, want ErrNoTestCases", err)
		}
	}
	if calls != 2 {
		t.Errorf("source called %d times, want 2: an organiser adding the missing tests must take effect", calls)
	}
}

func TestTestCacheIsConcurrencySafe(t *testing.T) {
	cache := newTestCache(func(ctx context.Context, problemID string) ([]TestCase, error) {
		return []TestCase{{Ordinal: 1}}, nil
	})

	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if _, err := cache.get(context.Background(), "p1"); err != nil {
				t.Errorf("get: %v", err)
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
		t.Fatal("own submission never arrived")
	}
}
