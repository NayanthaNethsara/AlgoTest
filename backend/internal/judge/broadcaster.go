package judge

import (
	"sync"
)

type Broadcaster struct {
	mu          sync.RWMutex
	subscribers map[chan Result]string
}

func NewBroadcaster() *Broadcaster {
	return &Broadcaster{
		subscribers: make(map[chan Result]string),
	}
}

// Subscribe adds a subscriber channel filtered by userID (if empty, receives all).
func (b *Broadcaster) Subscribe(userID string) (chan Result, func()) {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch := make(chan Result, 50)
	b.subscribers[ch] = userID

	unsubscribe := func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		delete(b.subscribers, ch)
		close(ch)
	}

	return ch, unsubscribe
}

// Broadcast dispatches a Result event to authorized subscriber channels.
func (b *Broadcaster) Broadcast(res Result) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for ch, subUserID := range b.subscribers {
		// Enforce user-level event isolation: if subUserID is set, only forward events belonging to subUserID
		if subUserID != "" && res.UserID != "" && res.UserID != subUserID {
			continue
		}

		select {
		case ch <- res:
		default:
			// Non-blocking write if subscriber buffer is full
		}
	}
}
