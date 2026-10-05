package ws

import (
	"errors"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"munchkin-tracker-server/internal/clientip"
	"munchkin-tracker-server/internal/room"
)

// HandleWebSocket upgrades connections from allowed origins. Requests without
// an Origin header (native mobile apps, CLI tools) are allowed: Origin checks
// only protect against cross-site use from browsers.
func HandleWebSocket(manager *room.Manager, hub *Hub, allowedOrigins []string) http.HandlerFunc {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = true
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			return origin == "" || allowed[origin]
		},
	}

	return func(w http.ResponseWriter, r *http.Request) {
		ip := clientip.FromRequest(r)
		if err := hub.acquire(ip); err != nil {
			status := http.StatusTooManyRequests
			if errors.Is(err, errShuttingDown) {
				status = http.StatusServiceUnavailable
			}
			http.Error(w, err.Error(), status)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			hub.release(ip)
			log.Printf("ws upgrade error: %v", err)
			return
		}

		client := NewClient(uuid.NewString(), ip, conn, manager, hub)
		hub.register(client)
		log.Printf("new ws connection: %s", client.id)

		go client.WritePump()
		go client.ReadPump()
	}
}
