package ws

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Hub tracks open connections so they can be closed on shutdown.
type Hub struct {
	mu      sync.Mutex
	clients map[*Client]struct{}
	closing bool
}

func NewHub() *Hub {
	return &Hub{clients: make(map[*Client]struct{})}
}

// add registers a client. It returns false once the hub is shutting down.
func (h *Hub) add(c *Client) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closing {
		return false
	}
	h.clients[c] = struct{}{}
	return true
}

func (h *Hub) remove(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, c)
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

	msg := websocket.FormatCloseMessage(websocket.CloseGoingAway, "server restarting")
	for _, c := range clients {
		c.conn.WriteControl(websocket.CloseMessage, msg, time.Now().Add(time.Second))
		c.close()
	}
	return len(clients)
}
