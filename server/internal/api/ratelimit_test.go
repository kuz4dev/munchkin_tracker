package api

import (
	"testing"
	"time"
)

func TestRateLimiter(t *testing.T) {
	now := time.Unix(0, 0)
	l := newRateLimiter(2, time.Minute)
	l.now = func() time.Time { return now }

	if !l.Allow("a") || !l.Allow("a") {
		t.Fatal("first two requests should pass")
	}
	if l.Allow("a") {
		t.Error("third request should be limited")
	}
	if !l.Allow("b") {
		t.Error("other keys are independent")
	}

	now = now.Add(time.Minute)
	if !l.Allow("a") {
		t.Error("limit should reset after the window")
	}
}
