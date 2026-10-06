package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"munchkin-tracker-server/internal/models"
	"munchkin-tracker-server/internal/room"
	"munchkin-tracker-server/internal/store"
)

const (
	createRoomLimit  = 10
	createRoomWindow = time.Minute
	readLimit        = 120
	readWindow       = time.Minute
)

const (
	defaultEventsPage = 50
	maxEventsPage     = 200
)

// EventLister reads a game's history from the store.
type EventLister interface {
	ListEvents(ctx context.Context, gameID string, beforeSeq int64, limit int) ([]store.Event, error)
}

func RegisterRoutes(r chi.Router, manager *room.Manager, events EventLister, metrics *Metrics) {
	createLimiter := newRateLimiter(createRoomLimit, createRoomWindow)
	readLimiter := newRateLimiter(readLimit, readWindow)
	metricsLimiter := newRateLimiter(metricsLimit, metricsWindow)
	r.With(createLimiter.Middleware).Post("/api/rooms", createRoom(manager))
	r.With(readLimiter.Middleware).Get("/api/rooms/{code}", getRoomInfo(manager))
	r.With(readLimiter.Middleware).Get("/api/rooms/{code}/events", listEvents(manager, events))
	r.With(metricsLimiter.Middleware).Post("/api/metrics", trackMetric(metrics))
}

// Pinger checks that a dependency is reachable.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Health reports whether the server can reach its database. It is used by
// the hosting platform to decide when a new deploy can take traffic.
func Health(p Pinger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := p.Ping(ctx); err != nil {
			log.Printf("health check: %v", err)
			writeError(w, http.StatusServiceUnavailable, "database unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

type eventsPage struct {
	Events  []*models.ChangeLogEntry `json:"events"`
	HasMore bool                     `json:"hasMore"`
}

// listEvents pages backwards through a game's history:
// GET /api/rooms/{code}/events?before=SEQ&limit=N returns up to N events with
// seq < SEQ, oldest first.
func listEvents(manager *room.Manager, events EventLister) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		before, err := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
		if err != nil || before < 1 {
			writeError(w, http.StatusBadRequest, "before must be a positive event seq")
			return
		}
		limit := defaultEventsPage
		if raw := r.URL.Query().Get("limit"); raw != "" {
			limit, err = strconv.Atoi(raw)
			if err != nil || limit < 1 || limit > maxEventsPage {
				writeError(w, http.StatusBadRequest, "limit must be between 1 and 200")
				return
			}
		}

		rm, err := manager.GetRoom(r.Context(), chi.URLParam(r, "code"))
		if err != nil {
			log.Printf("load room: %v", err)
			writeError(w, http.StatusServiceUnavailable, "temporarily unavailable")
			return
		}
		if rm == nil {
			writeError(w, http.StatusNotFound, "room not found")
			return
		}

		// Ask for one extra event to learn whether there are more.
		list, err := events.ListEvents(r.Context(), rm.ID, before, limit+1)
		if err != nil {
			log.Printf("list events: %v", err)
			writeError(w, http.StatusServiceUnavailable, "temporarily unavailable")
			return
		}
		page := eventsPage{Events: make([]*models.ChangeLogEntry, 0, limit)}
		if len(list) > limit {
			page.HasMore = true
			list = list[1:] // oldest first: drop the extra, oldest one
		}
		for _, e := range list {
			page.Events = append(page.Events, e.Entry())
		}
		writeJSON(w, http.StatusOK, page)
	}
}

func createRoom(manager *room.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rm, err := manager.CreateRoom()
		if errors.Is(err, room.ErrTooManyRooms) {
			writeError(w, http.StatusServiceUnavailable, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, models.RoomInfo{
			Code:        rm.Code,
			PlayerCount: 0,
		})
	}
}

func getRoomInfo(manager *room.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rm, err := manager.GetRoom(r.Context(), chi.URLParam(r, "code"))
		if err != nil {
			log.Printf("load room: %v", err)
			writeError(w, http.StatusServiceUnavailable, "temporarily unavailable")
			return
		}
		if rm == nil {
			writeError(w, http.StatusNotFound, "room not found")
			return
		}
		writeJSON(w, http.StatusOK, models.RoomInfo{
			Code:        rm.Code,
			PlayerCount: rm.PlayerCount(),
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
