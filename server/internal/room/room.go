package room

import (
	"encoding/json"
	"log"
	"sync"

	"munchkin-tracker-server/internal/models"
)

type Client interface {
	ID() string
	Send(data []byte)
}

type Room struct {
	Code    string
	players map[string]*models.Player
	clients map[Client]bool
	mu      sync.RWMutex
}

func NewRoom(code string) *Room {
	return &Room{
		Code:    code,
		players: make(map[string]*models.Player),
		clients: make(map[Client]bool),
	}
}

func (r *Room) AddClient(c Client, player *models.Player) {
	r.mu.Lock()
	r.clients[c] = true
	r.players[player.ID] = player
	r.mu.Unlock()

	r.broadcastPlayerJoined(player)
	r.sendRoomState(c)
}

func (r *Room) RemoveClient(c Client) {
	r.mu.Lock()
	delete(r.clients, c)
	playerID := c.ID()
	delete(r.players, playerID)
	r.mu.Unlock()

	r.broadcastPlayerLeft(playerID)
}

func (r *Room) UpdatePlayer(player *models.Player) {
	r.mu.Lock()
	if _, ok := r.players[player.ID]; ok {
		r.players[player.ID] = player
	}
	r.mu.Unlock()

	r.broadcastPlayerUpdated(player)
}

func (r *Room) PlayerCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.players)
}

func (r *Room) IsEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients) == 0
}

func (r *Room) sendRoomState(c Client) {
	r.mu.RLock()
	players := make([]*models.Player, 0, len(r.players))
	for _, p := range r.players {
		players = append(players, p)
	}
	r.mu.RUnlock()

	msg := models.OutgoingMessage{
		Type:     "room_state",
		RoomCode: r.Code,
		Players:  players,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("error marshaling room_state: %v", err)
		return
	}
	c.Send(data)
}

func (r *Room) broadcastPlayerJoined(player *models.Player) {
	msg := models.OutgoingMessage{
		Type:   "player_joined",
		Player: player,
	}
	r.broadcast(msg)
}

func (r *Room) broadcastPlayerLeft(playerID string) {
	msg := models.OutgoingMessage{
		Type:     "player_left",
		PlayerID: playerID,
	}
	r.broadcast(msg)
}

func (r *Room) broadcastPlayerUpdated(player *models.Player) {
	msg := models.OutgoingMessage{
		Type:   "player_updated",
		Player: player,
	}
	r.broadcast(msg)
}

func (r *Room) broadcast(msg models.OutgoingMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("error marshaling broadcast: %v", err)
		return
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	for c := range r.clients {
		c.Send(data)
	}
}
