package judge

import (
	"context"
	"sync"
)

// testCache keeps a problem's test data in memory. Every worker otherwise pulls
// the full inputs and expected outputs from Postgres for every submission, and
// a problem's tests only change when an organiser edits them.
type testCache struct {
	mu     sync.RWMutex
	byID   map[string][]TestCase
	source func(ctx context.Context, problemID string) ([]TestCase, error)
}

func newTestCache(source func(ctx context.Context, problemID string) ([]TestCase, error)) *testCache {
	return &testCache{byID: make(map[string][]TestCase), source: source}
}

func (c *testCache) get(ctx context.Context, problemID string) ([]TestCase, error) {
	c.mu.RLock()
	tests, ok := c.byID[problemID]
	c.mu.RUnlock()
	if ok {
		return tests, nil
	}

	tests, err := c.source(ctx, problemID)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.byID[problemID] = tests
	c.mu.Unlock()
	return tests, nil
}

// Invalidate drops a problem's cached tests. Called when its tests are edited.
func (c *testCache) invalidate(problemID string) {
	c.mu.Lock()
	delete(c.byID, problemID)
	c.mu.Unlock()
}

// WarmAll bulk-populates the in-memory cache with test suites.
func (c *testCache) warmAll(allTests map[string][]TestCase) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for pid, tests := range allTests {
		c.byID[pid] = tests
	}
}

// Len returns the number of problem test suites currently held in memory.
func (c *testCache) len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.byID)
}
