package room

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"

	"munchkin-tracker-server/internal/models"
	"munchkin-tracker-server/internal/store"
)

const maxChangeLogEntries = 100

// MaxPlayers caps players per game: Munchkin is played by 3–6, expansions
// allow a few more. It keeps a single client from flooding a room with seats.
const MaxPlayers = 12

const (
	// EmptyRoomTTL is how long a room with no players is kept.
	EmptyRoomTTL = 10 * time.Minute
	// OfflineRoomTTL is how long a game survives with all players offline
	// (phones fall asleep during long games).
	OfflineRoomTTL = 2 * time.Hour
)

// MsgSessionReplaced is sent to a connection whose session was taken over by
// a newer connection (another tab, or a reconnect before the old socket died).
const MsgSessionReplaced = "session replaced"

var (
	ErrRoomClosed    = errors.New("room not found")
	ErrNotInRoom     = errors.New("not in a room")
	ErrAlreadyInRoom = errors.New("already in a room")
	ErrGameFinished  = errors.New("game finished")
	ErrRoomFull      = errors.New("room is full")
	ErrUnknownWinner = errors.New("unknown winner")
	ErrNotHost       = errors.New("only the host can finish the game")
)

type Client interface {
	ID() string
	Send(data []byte)
}

// Persister receives every change to the game, in order. It must not block
// for long: it is called under the room lock.
type Persister interface {
	Enqueue(ops ...store.Op)
}

type nopPersister struct{}

func (nopPersister) Enqueue(...store.Op) {}

// seat is a player's place in the game. It outlives connections: a player
// who disconnects stays in the game (offline) until they explicitly leave.
type seat struct {
	player      *models.Player
	sessionHash string
	client      Client // nil while offline
	joinedAt    time.Time
}

// Room holds the state of one game. All mutations and the broadcasts they
// cause happen under mu, so every client observes events in the same order.
// Client.Send must therefore never block.
type Room struct {
	ID        string // game ID, unique across restarts (codes get reused)
	Code      string
	CreatedAt time.Time
	persist   Persister
	// Lifecycle: an active game becomes finished once, never back.
	status     string
	winnerID   string
	finishedAt time.Time
	// hostID is the player who may finish the game: whoever joined first.
	// It passes on only when the host leaves, not when they are offline.
	hostID    string
	seats     map[string]*seat // player ID -> seat
	bySession map[string]*seat // session hash -> seat
	byClient  map[string]*seat // client ID -> seat
	changelog []*models.ChangeLogEntry
	nextSeq   int64
	idleSince time.Time // zero while anyone is online
	closed    bool
	mu        sync.Mutex
}

// NewRoom creates an empty room. persist may be nil.
func NewRoom(code string, persist Persister) *Room {
	if persist == nil {
		persist = nopPersister{}
	}
	now := time.Now()
	return &Room{
		ID:        uuid.NewString(),
		Code:      code,
		CreatedAt: now,
		persist:   persist,
		status:    store.StatusActive,
		seats:     make(map[string]*seat),
		bySession: make(map[string]*seat),
		byClient:  make(map[string]*seat),
		nextSeq:   1,
		idleSince: now,
	}
}

// RestoreRoom rebuilds a room from the store, e.g. after a restart or deploy.
// Every player starts offline and resumes their seat with their session ID.
func RestoreRoom(g *store.LoadedGame, persist Persister) *Room {
	r := NewRoom(g.Game.Code, persist)
	r.ID = g.Game.ID
	r.CreatedAt = g.Game.CreatedAt
	r.nextSeq = g.LastSeq + 1
	for _, s := range g.Seats {
		st := &seat{
			player:      &models.Player{ID: s.ID, Name: s.Name, Stats: s.Stats},
			sessionHash: s.SessionHash,
			joinedAt:    s.JoinedAt,
		}
		r.seats[st.player.ID] = st
		r.bySession[st.sessionHash] = st
	}
	r.hostID = g.Game.HostSeatID
	if r.seats[r.hostID] == nil {
		// Games from before hosts existed: the longest-seated player hosts.
		r.setHostLocked(r.longestSeatedLocked())
	}
	for _, e := range g.RecentEvents {
		r.addChangeLogEntry(e.Entry())
	}
	return r
}

// gameRecord describes the room for the store.
func (r *Room) gameRecord() store.Game {
	return store.Game{
		ID:             r.ID,
		Code:           r.Code,
		Status:         store.StatusActive,
		CreatedAt:      r.CreatedAt,
		LastActivityAt: r.CreatedAt,
	}
}

// setHostLocked makes playerID the host (empty for none) and tells everyone.
func (r *Room) setHostLocked(playerID string) {
	if r.hostID == playerID {
		return
	}
	r.hostID = playerID
	r.persist.Enqueue(store.SetHost{GameID: r.ID, SeatID: playerID})
	r.broadcastLocked(models.OutgoingMessage{Type: "host_changed", HostID: playerID})
}

// longestSeatedLocked returns the player who joined first, or "" if none.
func (r *Room) longestSeatedLocked() string {
	var first *seat
	for _, s := range r.seats {
		if first == nil || s.joinedAt.Before(first.joinedAt) ||
			(s.joinedAt.Equal(first.joinedAt) && s.player.ID < first.player.ID) {
			first = s
		}
	}
	if first == nil {
		return ""
	}
	return first.player.ID
}

// HashSession returns the form in which session IDs are kept on the server.
// The raw session ID is a bearer secret known only to its owner.
func HashSession(sessionID string) string {
	sum := sha256.Sum256([]byte(sessionID))
	return hex.EncodeToString(sum[:])
}

// Join attaches a client to the room. A known sessionID resumes that seat
// (taking it over from another connection if needed); otherwise a new player
// is created with a fresh server-generated session ID.
func (r *Room) Join(c Client, name, sessionID string) (*models.Player, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.closed {
		return nil, ErrRoomClosed
	}
	if _, exists := r.byClient[c.ID()]; exists {
		return nil, ErrAlreadyInRoom
	}

	if sessionID != "" {
		// Players can always come back to their seat, even to look at the
		// results of a finished game.
		if s := r.bySession[HashSession(sessionID)]; s != nil {
			wasOnline := s.client != nil
			if wasOnline {
				sendLocked(s.client, models.OutgoingMessage{Type: "error", Message: MsgSessionReplaced})
				delete(r.byClient, s.client.ID())
			}
			r.connectLocked(s, c)
			if !wasOnline {
				r.broadcastExceptLocked(c, models.OutgoingMessage{Type: "player_updated", Player: s.player})
			}
			r.sendRoomStateLocked(c, s, sessionID)
			return s.player, nil
		}
	}

	if r.status != store.StatusActive {
		return nil, ErrGameFinished
	}
	if len(r.seats) >= MaxPlayers {
		return nil, ErrRoomFull
	}

	sessionID = uuid.NewString()
	s := &seat{
		player: &models.Player{
			ID:    uuid.NewString(),
			Name:  name,
			Stats: models.DefaultStats(),
		},
		sessionHash: HashSession(sessionID),
		joinedAt:    time.Now(),
	}
	r.seats[s.player.ID] = s
	r.bySession[s.sessionHash] = s
	r.connectLocked(s, c)
	r.persist.Enqueue(store.AddSeat{Seat: store.Seat{
		ID:          s.player.ID,
		GameID:      r.ID,
		SessionHash: s.sessionHash,
		Name:        s.player.Name,
		Stats:       s.player.Stats,
		JoinedAt:    s.joinedAt,
	}})
	if r.hostID == "" {
		r.setHostLocked(s.player.ID)
	}

	entry := r.appendEventLocked(s.player, "join", "", "", "")
	r.broadcastExceptLocked(c, models.OutgoingMessage{Type: "player_joined", Player: s.player})
	r.broadcastExceptLocked(c, models.OutgoingMessage{Type: "changelog_entry", ChangeLogEntry: entry})
	r.sendRoomStateLocked(c, s, sessionID)
	return s.player, nil
}

func (r *Room) connectLocked(s *seat, c Client) {
	s.client = c
	s.player.Connected = true
	r.byClient[c.ID()] = s
	r.updateIdleLocked()
}

// Leave removes the client's player from the game (explicit leave). Leaving a
// finished game only disconnects: the results stay as they were.
func (r *Room) Leave(c Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	s := r.byClient[c.ID()]
	if s == nil {
		return
	}
	if r.status != store.StatusActive {
		r.disconnectLocked(c, s)
		return
	}
	delete(r.byClient, c.ID())
	delete(r.seats, s.player.ID)
	delete(r.bySession, s.sessionHash)
	s.client = nil
	s.player.Connected = false
	r.updateIdleLocked()
	r.persist.Enqueue(store.RemoveSeat{SeatID: s.player.ID, At: time.Now()})

	entry := r.appendEventLocked(s.player, "leave", "", "", "")
	r.broadcastLocked(models.OutgoingMessage{Type: "changelog_entry", ChangeLogEntry: entry})
	r.broadcastLocked(models.OutgoingMessage{Type: "player_left", PlayerID: s.player.ID})
	if r.hostID == s.player.ID {
		r.setHostLocked(r.longestSeatedLocked())
	}
}

// Disconnect marks the client's player offline. The player stays in the game
// and can resume with its session ID. It is a no-op for clients that already
// left or whose session was taken over.
func (r *Room) Disconnect(c Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	s := r.byClient[c.ID()]
	if s == nil {
		return
	}
	r.disconnectLocked(c, s)
}

func (r *Room) disconnectLocked(c Client, s *seat) {
	delete(r.byClient, c.ID())
	s.client = nil
	s.player.Connected = false
	r.updateIdleLocked()

	r.broadcastLocked(models.OutgoingMessage{Type: "player_updated", Player: s.player})
}

// Finish ends the game. winnerID may be empty to finish without a winner.
func (r *Room) Finish(c Client, winnerID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	s := r.byClient[c.ID()]
	if s == nil {
		return ErrNotInRoom
	}
	if r.status != store.StatusActive {
		return ErrGameFinished
	}
	if s.player.ID != r.hostID {
		return ErrNotHost
	}
	winnerName := ""
	if winnerID != "" {
		winner := r.seats[winnerID]
		if winner == nil {
			return ErrUnknownWinner
		}
		winnerName = winner.player.Name
	}

	r.status = store.StatusFinished
	r.winnerID = winnerID
	r.finishedAt = time.Now()
	r.persist.Enqueue(store.FinishGame{GameID: r.ID, WinnerSeatID: winnerID, At: r.finishedAt})

	entry := r.appendEventLocked(s.player, "finish", "", "", winnerName)
	r.broadcastLocked(models.OutgoingMessage{Type: "changelog_entry", ChangeLogEntry: entry})
	r.broadcastLocked(models.OutgoingMessage{
		Type:       "game_finished",
		Status:     r.status,
		WinnerID:   r.winnerID,
		FinishedAt: r.finishedAt.UnixMilli(),
	})
	return nil
}

// UpdateStats validates and applies new stats for the client's own player.
func (r *Room) UpdateStats(c Client, stats models.Stats) error {
	if err := stats.Validate(); err != nil {
		return err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	s := r.byClient[c.ID()]
	if s == nil {
		return ErrNotInRoom
	}
	if r.status != store.StatusActive {
		return ErrGameFinished
	}
	player := s.player

	type change struct{ field, old, new string }
	var changes []change
	diff := func(field, oldValue, newValue string) {
		if oldValue != newValue {
			changes = append(changes, change{field, oldValue, newValue})
		}
	}
	old := player.Stats
	diff("level", strconv.Itoa(old.Level), strconv.Itoa(stats.Level))
	diff("gearBonus", strconv.Itoa(old.GearBonus), strconv.Itoa(stats.GearBonus))
	diff("gender", old.Gender, stats.Gender)
	diff("race", old.Race, stats.Race)
	diff("class", old.Class, stats.Class)

	if len(changes) == 0 {
		return nil
	}

	player.Stats = stats
	r.persist.Enqueue(store.UpdateSeatStats{SeatID: player.ID, Stats: stats})
	for _, ch := range changes {
		entry := r.appendEventLocked(player, "stat_change", ch.field, ch.old, ch.new)
		r.broadcastLocked(models.OutgoingMessage{Type: "changelog_entry", ChangeLogEntry: entry})
	}
	r.broadcastLocked(models.OutgoingMessage{Type: "player_updated", Player: player})
	return nil
}

// HasOnline reports whether any player is currently connected.
func (r *Room) HasOnline() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.byClient) > 0
}

func (r *Room) PlayerCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.seats)
}

// CloseIfIdle closes the room if nobody has been online for long enough. A
// closed room rejects joins, so a client racing with cleanup gets "room not
// found" instead of joining an orphaned room.
func (r *Room) CloseIfIdle(now time.Time) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return true
	}
	if r.idleSince.IsZero() {
		return false
	}
	ttl := EmptyRoomTTL
	if len(r.seats) > 0 && r.status == store.StatusActive {
		ttl = OfflineRoomTTL
	}
	if now.Sub(r.idleSince) < ttl {
		return false
	}
	r.closed = true
	return true
}

func (r *Room) updateIdleLocked() {
	if len(r.byClient) == 0 {
		if r.idleSince.IsZero() {
			r.idleSince = time.Now()
		}
	} else {
		r.idleSince = time.Time{}
	}
}

// appendEventLocked records a game event and returns its changelog entry.
func (r *Room) appendEventLocked(p *models.Player, eventType, field, oldValue, newValue string) *models.ChangeLogEntry {
	event := store.Event{
		GameID:     r.ID,
		Seq:        r.nextSeq,
		SeatID:     p.ID,
		PlayerName: p.Name,
		Type:       eventType,
		Field:      field,
		OldValue:   oldValue,
		NewValue:   newValue,
		CreatedAt:  time.Now(),
	}
	r.nextSeq++
	r.persist.Enqueue(store.AppendEvent{Event: event})
	entry := event.Entry()
	r.addChangeLogEntry(entry)
	return entry
}

// addChangeLogEntry appends an entry to the in-memory changelog tail (must be called under r.mu).
func (r *Room) addChangeLogEntry(entry *models.ChangeLogEntry) {
	r.changelog = append(r.changelog, entry)
	if len(r.changelog) > maxChangeLogEntries {
		r.changelog = r.changelog[len(r.changelog)-maxChangeLogEntries:]
	}
}

// sendRoomStateLocked sends the full room state to c, including the
// recipient's own player ID and secret session ID.
func (r *Room) sendRoomStateLocked(c Client, self *seat, sessionID string) {
	players := make([]*models.Player, 0, len(r.seats))
	for _, s := range r.seats {
		players = append(players, s.player)
	}
	msg := models.OutgoingMessage{
		Type:      "room_state",
		RoomCode:  r.Code,
		Players:   players,
		PlayerID:  self.player.ID,
		SessionID: sessionID,
		ChangeLog: r.changelog,
		Status:    r.status,
		WinnerID:  r.winnerID,
		HostID:    r.hostID,
		CreatedAt: r.CreatedAt.UnixMilli(),
	}
	if !r.finishedAt.IsZero() {
		msg.FinishedAt = r.finishedAt.UnixMilli()
	}
	sendLocked(c, msg)
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
	for id, s := range r.byClient {
		if except != nil && id == except.ID() {
			continue
		}
		s.client.Send(data)
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
