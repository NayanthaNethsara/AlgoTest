package api

import (
	"testing"
	"time"

	"golang.org/x/time/rate"
)

func TestEvictIdleKeepsActiveLimiters(t *testing.T) {
	store := NewLimiterStore(rate.Every(time.Second), 1)

	active := store.Get("active")
	if !active.Allow() {
		t.Fatal("first request should be allowed")
	}
	if active.Allow() {
		t.Fatal("burst of one should now be spent")
	}

	store.mu.Lock()
	store.limiters["idle"] = &entry{
		limiter: rate.NewLimiter(rate.Every(time.Second), 1),
		seen:    time.Now().Add(-2 * idleEviction),
	}
	store.mu.Unlock()

	store.evictIdle(time.Now())

	store.mu.Lock()
	_, idlePresent := store.limiters["idle"]
	_, activePresent := store.limiters["active"]
	store.mu.Unlock()

	if idlePresent {
		t.Error("an untouched key should be evicted")
	}
	if !activePresent {
		t.Error("a key still being limited must survive eviction")
	}
	if store.Get("active").Allow() {
		t.Error("eviction handed back an unspent burst")
	}
}

func TestLimiterStoreRateLimiting(t *testing.T) {
	store := NewLimiterStore(rate.Every(100*time.Millisecond), 2)

	limiter := store.Get("user-1")
	if !limiter.Allow() {
		t.Fatal("first request should be allowed")
	}
	if !limiter.Allow() {
		t.Fatal("second request within burst should be allowed")
	}
	if limiter.Allow() {
		t.Fatal("third request exceeding burst should be rejected")
	}
}

func TestLoginSemaphoreConcurrencyLimit(t *testing.T) {
	sem := make(chan struct{}, 2)

	sem <- struct{}{}
	sem <- struct{}{}

	select {
	case sem <- struct{}{}:
		t.Fatal("should block when semaphore is full")
	default:
		// Expected behavior
	}

	<-sem
	select {
	case sem <- struct{}{}:
		// Successfully acquired after slot freed
	default:
		t.Fatal("should acquire after slot freed")
	}
}
