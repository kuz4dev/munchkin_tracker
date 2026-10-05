package room

import (
	"encoding/json"
	"errors"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"

	"munchkin-tracker-server/internal/models"
)

const maxChangeLogEntries = 100

const ghostTimeout = 2 * time.Minute

// MsgSessionReplaced is sent to a connection whose session was taken over by
// a newer connection (another tab, or a reconnect before the old socket died).
const MsgSessionReplaced = "session replaced"

var (
	ErrRoomClosed    = errors.New("room not found")
	ErrNotInRoom     = errors.New("not in a room")
	ErrAlreadyInRoom = errors.New("already in a room")
)

type Client interface {
	ID() string
	Send(data []byte)
}

type ghostEntry struct {
	player *models.Player
	timer  *time.Timer
}

// Room holds the state of one game. All mutations and the broadcasts they
// cause happen under mu, so every client observes events in the same order.
// Client.Send must therefore never block.
type Room struct {
	Code       string
	players    map[string]*models.Player // playerID -> Player (active)
	clients    map[string]Client         // playerID -> Client
	sessionMap map[string]string         // sessionID -> playerID (active)
	ghosts     map[string]*ghostEntry    // sessionID -> ghost (disconnected)
	changelog  []*models.ChangeLogEntry
	emptySince time.Time // zero while anyone (active or ghost) is in the room
	closed     bool
	mu         sync.Mutex
}

func NewRoom(code string) *Room {
	return &Room{
		Code:       code,
		players:    make(map[string]*models.Player),
		clients:    make(map[string]Client),
		sessionMap: make(map[string]string),
		ghosts:     make(map[string]*ghostEntry),
		emptySince: time.Now(),
	}
}

// Join adds a client to the room. If sessionID matches a disconnected (ghost)
// or still-active player, that player is restored with its stats; otherwise a
// new player is created with a fresh server-generated session ID.
func (r *Room) Join(c Client, name, sessionID string) (*models.Player, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.closed {
		return nil, ErrRoomClosed
	}
	if _, exists := r.clients[c.ID()]; exists {
		return nil, ErrAlreadyInRoom
	}

	if sessionID != "" {
		if ghost, ok := r.ghosts[sessionID]; ok {
			ghost.timer.Stop()
			delete(r.ghosts, sessionID)
			player := ghost.player
			oldID := player.ID
			r.attachLocked(c, player)

			entry := r.newEntry(player.Name, "join")
			r.addChangeLogEntry(entry)
			r.broadcastExceptLocked(c, models.OutgoingMessage{Type: "player_left", PlayerID: oldID})
			r.broadcastExceptLocked(c, models.OutgoingMessage{Type: "player_joined", Player: player})
			r.broadcastExceptLocked(c, models.OutgoingMessage{Type: "changelog_entry", ChangeLogEntry: entry})
			r.sendRoomStateLocked(c, player)
			return player, nil
		}

		if oldID, ok := r.sessionMap[sessionID]; ok {
			// Session is still active on another connection: move it here.
			player := r.players[oldID]
			if old := r.clients[oldID]; old != nil {
				sendLocked(old, models.OutgoingMessage{Type: "error", Message: MsgSessionReplaced})
			}
			delete(r.clients, oldID)
			delete(r.players, oldID)
			r.attachLocked(c, player)

			r.broadcastExceptLocked(c, models.OutgoingMessage{Type: "player_left", PlayerID: oldID})
			r.broadcastExceptLocked(c, models.OutgoingMessage{Type: "player_joined", Player: player})
			r.sendRoomStateLocked(c, player)
			return player, nil
		}
	}

	player := &models.Player{
		SessionID: uuid.NewString(),
		Name:      name,
		Stats:     models.DefaultStats(),
	}
	r.attachLocked(c, player)

	entry := r.newEntry(player.Name, "join")
	r.addChangeLogEntry(entry)
	r.broadcastExceptLocked(c, models.OutgoingMessage{Type: "player_joined", Player: player})
	r.broadcastExceptLocked(c, models.OutgoingMessage{Type: "changelog_entry", ChangeLogEntry: entry})
	r.sendRoomStateLocked(c, player)
	return player, nil
}

// attachLocked binds player to client c (player ID becomes the client ID).
func (r *Room) attachLocked(c Client, player *models.Player) {
	player.ID = c.ID()
	r.clients[player.ID] = c
	r.players[player.ID] = player
	r.sessionMap[player.SessionID] = player.ID
	r.updateEmptyLocked()
}

// Leave removes the client's player immediately (explicit leave).
func (r *Room) Leave(c Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.clients[c.ID()]; !ok {
		return
	}
	player := r.players[c.ID()]
	delete(r.clients, c.ID())
	delete(r.players, c.ID())
	delete(r.sessionMap, player.SessionID)
	r.updateEmptyLocked()

	entry := r.newEntry(player.Name, "leave")
	r.addChangeLogEntry(entry)
	r.broadcastLocked(models.OutgoingMessage{Type: "changelog_entry", ChangeLogEntry: entry})
	r.broadcastLocked(models.OutgoingMessage{Type: "player_left", PlayerID: player.ID})
}

// Disconnect moves the client's player to ghost state. Other players still
// see the ghost until it expires or the owner rejoins with its session ID.
// It is a no-op for clients that already left or whose session was taken over.
func (r *Room) Disconnect(c Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.clients[c.ID()]; !ok {
		return
	}
	player := r.players[c.ID()]
	delete(r.clients, c.ID())
	delete(r.players, c.ID())
	delete(r.sessionMap, player.SessionID)

	sessionID := player.SessionID
	r.ghosts[sessionID] = &ghostEntry{
		player: player,
		timer: time.AfterFunc(ghostTimeout, func() {
			r.expireGhost(sessionID)
		}),
	}
	r.updateEmptyLocked()
	log.Printf("player %s moved to ghost state in room %s", player.Name, r.Code)
}

func (r *Room) expireGhost(sessionID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	ghost, ok := r.ghosts[sessionID]
	if !ok {
		return
	}
	delete(r.ghosts, sessionID)
	r.updateEmptyLocked()

	entry := r.newEntry(ghost.player.Name, "leave")
	r.addChangeLogEntry(entry)
	r.broadcastLocked(models.OutgoingMessage{Type: "changelog_entry", ChangeLogEntry: entry})
	r.broadcastLocked(models.OutgoingMessage{Type: "player_left", PlayerID: ghost.player.ID})
	log.Printf("ghost %s expired in room %s", ghost.player.Name, r.Code)
}

// UpdateStats validates and applies new stats for the client's own player.
func (r *Room) UpdateStats(c Client, stats models.Stats) error {
	if err := stats.Validate(); err != nil {
		return err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	player, ok := r.players[c.ID()]
	if !ok {
		return ErrNotInRoom
	}

	old := player.Stats
	now := time.Now().UnixMilli()
	var entries []*models.ChangeLogEntry
	diff := func(field, oldValue, newValue string) {
		if oldValue != newValue {
			entries = append(entries, &models.ChangeLogEntry{
				Timestamp:  now,
				PlayerName: player.Name,
				EventType:  "stat_change",
				Field:      field,
				OldValue:   oldValue,
				NewValue:   newValue,
			})
		}
	}
	diff("level", strconv.Itoa(old.Level), strconv.Itoa(stats.Level))
	diff("gearBonus", strconv.Itoa(old.GearBonus), strconv.Itoa(stats.GearBonus))
	diff("gender", old.Gender, stats.Gender)
	diff("race", old.Race, stats.Race)
	diff("class", old.Class, stats.Class)

	if len(entries) == 0 {
		return nil
	}

	player.Stats = stats
	for _, e := range entries {
		r.addChangeLogEntry(e)
		r.broadcastLocked(models.OutgoingMessage{Type: "changelog_entry", ChangeLogEntry: e})
	}
	r.broadcastLocked(models.OutgoingMessage{Type: "player_updated", Player: player})
	return nil
}

func (r *Room) PlayerCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.players) + len(r.ghosts)
}

// CloseIfIdle closes the room if nobody (active or ghost) has been in it for
// at least ttl. A closed room rejects joins, so a client racing with cleanup
// gets "room not found" instead of joining an orphaned room.
func (r *Room) CloseIfIdle(now time.Time, ttl time.Duration) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return true
	}
	if r.emptySince.IsZero() || now.Sub(r.emptySince) < ttl {
		return false
	}
	r.closed = true
	return true
}

func (r *Room) updateEmptyLocked() {
	if len(r.clients) == 0 && len(r.ghosts) == 0 {
		if r.emptySince.IsZero() {
			r.emptySince = time.Now()
		}
	} else {
		r.emptySince = time.Time{}
	}
}

func (r *Room) newEntry(playerName, eventType string) *models.ChangeLogEntry {
	return &models.ChangeLogEntry{
		Timestamp:  time.Now().UnixMilli(),
		PlayerName: playerName,
		EventType:  eventType,
	}
}

// addChangeLogEntry appends an entry to the in-memory changelog (must be called under r.mu).
func (r *Room) addChangeLogEntry(entry *models.ChangeLogEntry) {
	r.changelog = append(r.changelog, entry)
	if len(r.changelog) > maxChangeLogEntries {
		r.changelog = r.changelog[len(r.changelog)-maxChangeLogEntries:]
	}
}

// sendRoomStateLocked sends the full room state to c, including the
// recipient's own player ID and secret session ID.
func (r *Room) sendRoomStateLocked(c Client, self *models.Player) {
	players := make([]*models.Player, 0, len(r.players)+len(r.ghosts))
	for _, p := range r.players {
		players = append(players, p)
	}
	for _, g := range r.ghosts {
		players = append(players, g.player)
	}
	sendLocked(c, models.OutgoingMessage{
		Type:      "room_state",
		RoomCode:  r.Code,
		Players:   players,
		PlayerID:  self.ID,
		SessionID: self.SessionID,
		ChangeLog: r.changelog,
	})
}

func (r *Room) broadcastLocked(msg models.OutgoingMessage) {
	r.broadcastExceptLocked(nil, msg)
}

func (r *Room) broadcastExceptLocked(except Client, msg models.OutgoingMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("error marshaling %s: %v", msg.Type, err)
		return
	}
	for id, c := range r.clients {
		if except != nil && id == except.ID() {
			continue
		}
		c.Send(data)
	}
}

func sendLocked(c Client, msg models.OutgoingMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("error marshaling %s: %v", msg.Type, err)
		return
	}
	c.Send(data)
}
