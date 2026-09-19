package judge

import (
	"context"
	"errors"
	"slices"
	"sync"
	"time"
)

type cachedTests struct {
	tests    []TestCase
	bytes    int64
	users    int
	lastUsed uint64
	ready    chan struct{}
	err      error
	expires  time.Time
}

type testCache struct {
	mu       sync.Mutex
	byID     map[string]*cachedTests
	bytes    int64
	maxBytes int64
	clock    uint64
	source   func(context.Context, string) ([]TestCase, error)
}

func newTestCache(maxBytes int64, source func(context.Context, string) ([]TestCase, error)) *testCache {
	return &testCache{byID: make(map[string]*cachedTests), maxBytes: maxBytes, source: source}
}

func (c *testCache) acquire(ctx context.Context, problemID string) ([]TestCase, func(), error) {
	for {
		if err := ctx.Err(); err != nil {
			return nil, nil, err
		}
		c.mu.Lock()
		entry := c.byID[problemID]
		// Bound stale data if a test-edit notification could not be delivered.
		if entry != nil && entry.ready == nil && time.Now().After(entry.expires) {
			c.bytes -= entry.bytes
			delete(c.byID, problemID)
			entry = nil
		}
		if entry != nil && entry.ready != nil {
			ready := entry.ready
			c.mu.Unlock()
			select {
			case <-ctx.Done():
				return nil, nil, ctx.Err()
			case <-ready:
				if entry.err != nil && !errors.Is(entry.err, context.Canceled) && !errors.Is(entry.err, context.DeadlineExceeded) {
					return nil, nil, entry.err
				}
				continue
			}
		}
		if entry == nil {
			entry = &cachedTests{ready: make(chan struct{})}
			c.byID[problemID] = entry
			c.mu.Unlock()

			tests, err := c.source(ctx, problemID)
			c.mu.Lock()
			ready := entry.ready
			entry.ready = nil
			if c.byID[problemID] != entry {
				close(ready)
				c.mu.Unlock()
				continue
			}
			entry.err = err
			if err != nil {
				delete(c.byID, problemID)
				close(ready)
				c.mu.Unlock()
				return nil, nil, err
			}
			entry.tests = tests
			entry.expires = time.Now().Add(5 * time.Minute)
			for _, test := range tests {
				entry.bytes += int64(len(test.Input)) + int64(len(test.Expected))
			}
			c.bytes += entry.bytes
			close(ready)
		}
		entry.users++
		c.clock++
		entry.lastUsed = c.clock
		c.evict()
		c.mu.Unlock()

		// Clone case metadata so point allocation cannot mutate the shared suite.
		// Input and expected bytes remain read-only and shared by all submissions.
		return slices.Clone(entry.tests), func() {
			c.mu.Lock()
			defer c.mu.Unlock()
			entry.users--
			c.evict()
		}, nil
	}
}

func (c *testCache) evict() {
	for c.bytes > c.maxBytes {
		var oldest *cachedTests
		var oldestID string
		for id, entry := range c.byID {
			if entry.ready == nil && entry.users == 0 && (oldest == nil || entry.lastUsed < oldest.lastUsed) {
				oldest, oldestID = entry, id
			}
		}
		if oldest == nil {
			return
		}
		delete(c.byID, oldestID)
		c.bytes -= oldest.bytes
	}
}

func (c *testCache) invalidate(problemID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if entry := c.byID[problemID]; entry != nil {
		c.bytes -= entry.bytes
		delete(c.byID, problemID)
	}
}

func (c *testCache) clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.byID = make(map[string]*cachedTests)
	c.bytes = 0
}
