package clientip

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func ipSeenBy(t *testing.T, header string, hops int, req *http.Request) string {
	t.Helper()
	mw, err := Middleware(header, hops)
	if err != nil {
		t.Fatal(err)
	}
	var got string
	mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = FromRequest(r)
	})).ServeHTTP(httptest.NewRecorder(), req)
	return got
}

func spoofed() *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "203.0.113.7:4321"
	r.Header.Set("X-Forwarded-For", "1.1.1.1")
	r.Header.Set("X-Real-IP", "2.2.2.2")
	r.Header.Set("True-Client-IP", "3.3.3.3")
	return r
}

func TestDefaultIgnoresHeaders(t *testing.T) {
	// Regression: chi's RealIP trusted these headers, so any client could
	// pick a fresh IP per request and bypass rate limits.
	if got := ipSeenBy(t, "", 0, spoofed()); got != "203.0.113.7" {
		t.Errorf("expected the TCP peer address, got %q", got)
	}
}

func TestXFFUsesRightmostTrustedEntry(t *testing.T) {
	r := spoofed()
	// The client claimed 1.1.1.1; our proxy appended the real address.
	r.Header.Set("X-Forwarded-For", "1.1.1.1, 198.51.100.9")
	if got := ipSeenBy(t, "X-Forwarded-For", 1, r); got != "198.51.100.9" {
		t.Errorf("expected the address appended by our proxy, got %q", got)
	}
	if _, err := Middleware("X-Forwarded-For", 0); err == nil {
		t.Error("expected an error for 0 trusted hops")
	}
}

func TestTrustedHeader(t *testing.T) {
	r := spoofed()
	r.Header.Set("CF-Connecting-IP", "198.51.100.20")
	if got := ipSeenBy(t, "CF-Connecting-IP", 0, r); got != "198.51.100.20" {
		t.Errorf("expected the trusted header, got %q", got)
	}
}
