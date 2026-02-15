package room

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"munchkin-tracker-server/internal/models"
)

const ghostTimeout = 2 * time.Minute

type Client interface {
	ID() string
	Send(data []byte)
}

type ghostEntry struct {
	player *models.Player
	timer  *time.Timer
}

type Room struct {
	Code       string
	players    map[string]*models.Player // playerID -> Player (active)
	clients    map[Client]bool
	sessionMap map[string]string      // sessionID -> playerID (active)
	ghosts     map[string]*ghostEntry // sessionID -> ghost (disconnected)
	mu         sync.RWMutex
}

func NewRoom(code string) *Room {
	return &Room{
		Code:       code,
		players:    make(map[string]*models.Player),
		clients:    make(map[Client]bool),
		sessionMap: make(map[string]string),
		ghosts:     make(map[string]*ghostEntry),
	}
}

func (r *Room) AddClient(c Client, player *models.Player) {
	r.mu.Lock()

	// If a player with the same sessionID already exists (e.g. ghost expired
	// but the old entry was never cleaned up), remove the stale entry first
	// to prevent duplicates on reconnect.
	if player.SessionID != "" {
		if oldPlayerID, exists := r.sessionMap[player.SessionID]; exists && oldPlayerID != player.ID {
			delete(r.players, oldPlayerID)
		}
		r.sessionMap[player.SessionID] = player.ID
	}

	r.clients[c] = true
	r.players[player.ID] = player
	r.mu.Unlock()

	r.broadcastPlayerJoined(player)
	r.sendRoomState(c)
}

// RemoveClient removes a client and player immediately (explicit leave).
func (r *Room) RemoveClient(c Client) {
	r.mu.Lock()
	delete(r.clients, c)
	playerID := c.ID()
	player := r.players[playerID]
	delete(r.players, playerID)
	// Clean up session map
	if player != nil && player.SessionID != "" {
		delete(r.sessionMap, player.SessionID)
	}
	r.mu.Unlock()

	r.broadcastPlayerLeft(playerID)
}

// DisconnectClient moves a player to ghost state instead of removing.
// Other players still see the ghost in room_state until the ghost expires.
func (r *Room) DisconnectClient(c Client, sessionID string) {
	r.mu.Lock()
	delete(r.clients, c)
	playerID := c.ID()
	player := r.players[playerID]

	if player != nil && sessionID != "" {
		// Move to ghost state
		delete(r.players, playerID)
		delete(r.sessionMap, sessionID)

		timer := time.AfterFunc(ghostTimeout, func() {
			r.expireGhost(sessionID, playerID)
		})
		r.ghosts[sessionID] = &ghostEntry{
			player: player,
			timer:  timer,
		}
		r.mu.Unlock()
		log.Printf("player %s moved to ghost state (session %s)", player.Name, sessionID)
		return
	}

	// No session ID — immediate removal
	delete(r.players, playerID)
	r.mu.Unlock()
	r.broadcastPlayerLeft(playerID)
}

// RejoinClient restores a ghost player to active state with a new client.
func (r *Room) RejoinClient(c Client, sessionID string) (*models.Player, bool) {
	r.mu.Lock()
	ghost, exists := r.ghosts[sessionID]
	if !exists {
		r.mu.Unlock()
		return nil, false
	}

	// Cancel the expiry timer
	ghost.timer.Stop()
	delete(r.ghosts, sessionID)

	// Remember old ID so we can tell other clients to remove the stale entry
	oldPlayerID := ghost.player.ID

	// Restore player with new client ID
	player := ghost.player
	player.ID = c.ID()

	r.clients[c] = true
	r.players[player.ID] = player
	r.sessionMap[sessionID] = player.ID
	r.mu.Unlock()

	// Tell other clients to drop the ghost entry under the old player ID,
	// then send the restored player as a fresh join so they add it under the new ID.
	r.broadcastPlayerLeft(oldPlayerID)
	r.broadcastPlayerJoined(player)
	r.sendRoomState(c)

	return player, true
}

// CancelGhost removes a ghost entry without broadcasting player_left.
// Used when a player explicitly leaves after disconnect.
func (r *Room) CancelGhost(sessionID string) {
	if sessionID == "" {
		return
	}
	r.mu.Lock()
	ghost, exists := r.ghosts[sessionID]
	if exists {
		ghost.timer.Stop()
		playerID := ghost.player.ID
		delete(r.ghosts, sessionID)
		r.mu.Unlock()
		r.broadcastPlayerLeft(playerID)
		return
	}
	r.mu.Unlock()
}

func (r *Room) expireGhost(sessionID string, playerID string) {
	r.mu.Lock()
	_, exists := r.ghosts[sessionID]
	if !exists {
		r.mu.Unlock()
		return
	}
	delete(r.ghosts, sessionID)
	r.mu.Unlock()

	log.Printf("ghost expired for session %s", sessionID)
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
	return len(r.players) + len(r.ghosts)
}

func (r *Room) IsEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients) == 0 && len(r.ghosts) == 0
}

func (r *Room) sendRoomState(c Client) {
	r.mu.RLock()
	players := make([]*models.Player, 0, len(r.players)+len(r.ghosts))
	for _, p := range r.players {
		players = append(players, p)
	}
	// Include ghost players so other clients still see them
	for _, g := range r.ghosts {
		players = append(players, g.player)
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
