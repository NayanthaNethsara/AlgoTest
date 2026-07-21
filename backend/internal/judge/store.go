package judge

import "sync"

type Store struct {
	mu      sync.RWMutex
	results map[string]Result
}

func NewStore() *Store {
	return &Store{results: make(map[string]Result)}
}

func (s *Store) Save(r Result) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.results[r.SubmissionID] = r
}

func (s *Store) Get(id string) (Result, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.results[id]
	return r, ok
}
