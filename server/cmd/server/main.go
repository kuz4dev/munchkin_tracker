package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"munchkin-tracker-server/internal/api"
	"munchkin-tracker-server/internal/room"
	"munchkin-tracker-server/internal/store"
	"munchkin-tracker-server/internal/ws"
)

// shutdownTimeout must fit in the platform's grace period (30s on Render).
const shutdownTimeout = 20 * time.Second

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	st, err := openStore(ctx)
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	if n, err := st.AbandonStale(ctx, time.Now().Add(-room.OfflineRoomTTL)); err != nil {
		log.Fatalf("store: %v", err)
	} else if n > 0 {
		log.Printf("marked %d stale game(s) abandoned", n)
	}
	writer := store.NewWriter(st)
	manager := room.NewManager(st, writer)

	janitorStop := make(chan struct{})
	go manager.RunJanitor(time.Minute, janitorStop)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	origins := allowedOrigins()

	hub := ws.NewHub()
	root := chi.NewRouter()
	root.Use(middleware.Recoverer)
	// Polled by the platform every few seconds, so kept out of the request log.
	root.Get("/healthz", api.Health(st))
	root.Group(func(r chi.Router) {
		r.Use(middleware.RealIP)
		r.Use(middleware.Logger)
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   origins,
			AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
			AllowedHeaders:   []string{"Content-Type"},
			AllowCredentials: true,
		}))
		api.RegisterRoutes(r, manager, st)
		r.Get("/ws", ws.HandleWebSocket(manager, hub, origins))
	})

	srv := &http.Server{Addr: ":" + port, Handler: root}
	go func() {
		log.Printf("server starting on :%s", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	close(janitorStop)
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("http shutdown: %v", err)
	}
	// WebSockets are hijacked connections, so Shutdown doesn't close them.
	log.Printf("closed %d websocket(s)", hub.CloseAll())
	if err := writer.Close(shutdownCtx); err != nil {
		log.Printf("store writer did not drain: %v", err)
	}
	st.Close()
	log.Println("bye")
}

// openStore uses Postgres when DATABASE_URL is set, memory otherwise.
func openStore(ctx context.Context) (store.Store, error) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		log.Println("DATABASE_URL not set: games are kept in memory only and lost on restart")
		return store.NewMemory(), nil
	}
	connectCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	pg, err := store.OpenPostgres(connectCtx, url)
	if err != nil {
		return nil, err
	}
	log.Println("connected to Postgres")
	return pg, nil
}

func allowedOrigins() []string {
	raw := os.Getenv("ALLOWED_ORIGINS")
	if raw == "" {
		raw = "http://localhost:5173,http://localhost:3000"
	}
	var origins []string
	for _, o := range strings.Split(raw, ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}
	return origins
}
