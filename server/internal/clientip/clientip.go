// Package clientip determines the client's IP address for rate limiting.
//
// Which source can be trusted depends on the deployment, so it is configured
// explicitly; headers a client could set itself are never trusted by default.
package clientip

import (
	"fmt"
	"net"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"
)

// Middleware returns the middleware that records the client IP:
//
//   - header == "": the TCP peer address. Use when clients connect directly.
//   - header == "X-Forwarded-For": the entry added by our own proxies, counted
//     from the right (trustedHops = number of proxies in front of the server).
//   - any other header (e.g. "CF-Connecting-IP"): that header's value. Only
//     safe if the proxy in front always overwrites it.
func Middleware(header string, trustedHops int) (func(http.Handler) http.Handler, error) {
	switch {
	case header == "":
		return middleware.ClientIPFromRemoteAddr, nil
	case http.CanonicalHeaderKey(header) == "X-Forwarded-For":
		if trustedHops < 1 {
			return nil, fmt.Errorf("X-Forwarded-For needs at least 1 trusted proxy hop, got %d", trustedHops)
		}
		return middleware.ClientIPFromXFFTrustedProxies(trustedHops), nil
	default:
		return middleware.ClientIPFromHeader(header), nil
	}
}

// FromRequest returns the IP recorded by Middleware, falling back to the TCP
// peer address if none was recorded (e.g. in tests).
func FromRequest(r *http.Request) string {
	if ip := middleware.GetClientIP(r.Context()); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
