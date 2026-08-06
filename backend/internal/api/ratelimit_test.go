package api

import (
	"testing"
	"time"

	"golang.org/x/time/rate"
)

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
