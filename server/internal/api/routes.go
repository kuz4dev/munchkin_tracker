package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"munchkin-tracker-server/internal/models"
	"munchkin-tracker-server/internal/room"
)

const (
	createRoomLimit  = 10
	createRoomWindow = time.Minute
)

func RegisterRoutes(r chi.Router, manager *room.Manager) {
	limiter := newRateLimiter(createRoomLimit, createRoomWindow)
	r.With(limiter.Middleware).Post("/api/rooms", createRoom(manager))
	r.Get("/api/rooms/{code}", getRoomInfo(manager))
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
		rm := manager.GetRoom(chi.URLParam(r, "code"))
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
