package api

import (
	"net/http"
	"sync"
	"time"

	"munchkin-tracker-server/internal/clientip"
)

// rateLimiter is a fixed-window per-key counter. The whole map is reset each
// window, so memory stays bounded by the number of keys seen in one window.
type rateLimiter struct {
	mu          sync.Mutex
	limit       int
	window      time.Duration
	windowStart time.Time
	counts      map[string]int
	now         func() time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		limit:  limit,
		window: window,
		counts: make(map[string]int),
		now:    time.Now,
	}
}

func (l *rateLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	if now.Sub(l.windowStart) >= l.window {
		l.windowStart = now
		l.counts = make(map[string]int)
	}
	if l.counts[key] >= l.limit {
		return false
	}
	l.counts[key]++
	return true
}

func (l *rateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.Allow(clientip.FromRequest(r)) {
			writeError(w, http.StatusTooManyRequests, "too many requests")
			return
		}
		next.ServeHTTP(w, r)
	})
}
