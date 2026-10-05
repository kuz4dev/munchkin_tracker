package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"munchkin-tracker-server/internal/api"
	"munchkin-tracker-server/internal/room"
	"munchkin-tracker-server/internal/ws"
)

// roomIdleTTL is how long a room survives with nobody in it, so players can
// still come back after everyone briefly disconnects.
const roomIdleTTL = 10 * time.Minute

func main() {
	manager := room.NewManager()
	go manager.RunJanitor(time.Minute, roomIdleTTL, make(chan struct{}))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "http://localhost:5173,http://localhost:3000"
	}
	var origins []string
	for _, o := range strings.Split(allowedOrigins, ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}

	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   origins,
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}))

	api.RegisterRoutes(r, manager)
	r.Get("/ws", ws.HandleWebSocket(manager, origins))

	log.Printf("server starting on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}
