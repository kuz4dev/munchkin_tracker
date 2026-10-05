package ws

import (
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"munchkin-tracker-server/internal/room"
)

// HandleWebSocket upgrades connections from allowed origins. Requests without
// an Origin header (native mobile apps, CLI tools) are allowed: Origin checks
// only protect against cross-site use from browsers.
func HandleWebSocket(manager *room.Manager, allowedOrigins []string) http.HandlerFunc {
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
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("ws upgrade error: %v", err)
			return
		}

		clientID := uuid.New().String()
		client := NewClient(clientID, conn, manager)

		log.Printf("new ws connection: %s", clientID)

		go client.WritePump()
		go client.ReadPump()
	}
}
