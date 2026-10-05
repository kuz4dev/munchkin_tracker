package ws

import (
	"errors"
	"sync"

	"github.com/gorilla/websocket"
)

const (
	// MaxConnections caps open WebSockets on this server.
	MaxConnections = 5000
	// MaxConnectionsPerIP caps WebSockets per client IP. Generous because
	// whole households or mobile carriers can share one address.
	MaxConnectionsPerIP = 50
)

var (
	errShuttingDown = errors.New("server is shutting down")
	errTooMany      = errors.New("too many connections")
)

// Hub tracks open connections to enforce connection limits and to close
// them all on shutdown.
type Hub struct {
	mu       sync.Mutex
	clients  map[*Client]struct{}
	perIP    map[string]int
	total    int
	closing  bool
	maxTotal int
	maxPerIP int
}

func NewHub() *Hub {
	return &Hub{
		clients:  make(map[*Client]struct{}),
		perIP:    make(map[string]int),
		maxTotal: MaxConnections,
		maxPerIP: MaxConnectionsPerIP,
	}
}

// acquire reserves a connection slot for ip before the WebSocket upgrade.
func (h *Hub) acquire(ip string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closing {
		return errShuttingDown
	}
	if h.total >= h.maxTotal || h.perIP[ip] >= h.maxPerIP {
		return errTooMany
	}
	h.total++
	h.perIP[ip]++
	return nil
}

// release frees a slot reserved by acquire.
func (h *Hub) release(ip string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.total--
	if h.perIP[ip]--; h.perIP[ip] <= 0 {
		delete(h.perIP, ip)
	}
}

// register tracks an upgraded connection whose slot is already reserved.
func (h *Hub) register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = struct{}{}
}

// remove forgets a connection and frees its slot. Safe to call twice.
func (h *Hub) remove(c *Client) {
	h.mu.Lock()
	_, ok := h.clients[c]
	delete(h.clients, c)
	h.mu.Unlock()
	if ok {
		h.release(c.ip)
	}
}

// CloseAll tells every client the server is going away and closes the
// connections. Clients reconnect (to the new instance after a deploy).
func (h *Hub) CloseAll() int {
	h.mu.Lock()
	h.closing = true
	clients := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.Unlock()

	for _, c := range clients {
		c.closeWith(websocket.CloseGoingAway, "server restarting")
	}
	return len(clients)
}
