package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"munchkin-tracker-server/internal/models"
	"munchkin-tracker-server/internal/room"
)

func RegisterRoutes(r chi.Router, manager *room.Manager) {
	r.Post("/api/rooms", createRoom(manager))
	r.Get("/api/rooms/{code}", getRoomInfo(manager))
}

func createRoom(manager *room.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rm := manager.CreateRoom()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(models.RoomInfo{
			Code:        rm.Code,
			PlayerCount: 0,
		})
	}
}

func getRoomInfo(manager *room.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		code := chi.URLParam(r, "code")
		rm := manager.GetRoom(code)
		if rm == nil {
			http.Error(w, `{"error":"room not found"}`, http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(models.RoomInfo{
			Code:        rm.Code,
			PlayerCount: rm.PlayerCount(),
		})
	}
}
