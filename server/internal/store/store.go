// Package store persists games so they survive server restarts.
//
// The in-memory rooms stay the source of truth for real-time play. They
// describe every change as an Op, which a Writer applies to a Store in the
// background, in order. Reads (restoring a game, paging through its history)
// go to the Store directly.
package store

import (
	"context"
	"time"

	"munchkin-tracker-server/internal/models"
)

const (
	StatusActive    = "active"
	StatusFinished  = "finished"
	StatusAbandoned = "abandoned"
)

// RecentEventsLimit is how many of the latest events LoadActiveGame returns.
const RecentEventsLimit = 100

type Game struct {
	ID             string
	Code           string
	Status         string
	CreatedAt      time.Time
	LastActivityAt time.Time
	FinishedAt     time.Time // zero unless finished
	WinnerSeatID   string    // empty if finished without a winner
	HostSeatID     string    // the player who may finish the game; empty if none
}

// Seat is a player's place in a game with their current stats.
type Seat struct {
	ID          string
	GameID      string
	SessionHash string
	Name        string
	models.Stats
	JoinedAt time.Time
}

type Event struct {
	GameID     string
	Seq        int64
	SeatID     string
	PlayerName string
	Type       string
	Field      string
	OldValue   string
	NewValue   string
	CreatedAt  time.Time
}

// Entry converts the event to its wire form.
func (e Event) Entry() *models.ChangeLogEntry {
	return &models.ChangeLogEntry{
		Seq:        e.Seq,
		Timestamp:  e.CreatedAt.UnixMilli(),
		PlayerID:   e.SeatID,
		PlayerName: e.PlayerName,
		EventType:  e.Type,
		Field:      e.Field,
		OldValue:   e.OldValue,
		NewValue:   e.NewValue,
	}
}

// LoadedGame is everything needed to bring an active game back into memory.
type LoadedGame struct {
	Game         Game
	Seats        []Seat  // players still in the game
	RecentEvents []Event // up to RecentEventsLimit latest events, oldest first
	LastSeq      int64
}

// Op is a single write. Ops are applied in the order they were enqueued.
type Op interface{ isOp() }

type CreateGame struct{ Game Game }

type AddSeat struct{ Seat Seat }

type UpdateSeatStats struct {
	SeatID string
	Stats  models.Stats
}

// RemoveSeat marks a player as having left the game.
type RemoveSeat struct {
	SeatID string
	At     time.Time
}

// AppendEvent records an event and bumps the game's last activity.
type AppendEvent struct{ Event Event }

// SetHost changes who may finish the game. SeatID may be empty.
type SetHost struct {
	GameID string
	SeatID string
}

type FinishGame struct {
	GameID       string
	WinnerSeatID string
	At           time.Time
}

// TouchGame bumps last activity while players are online but idle, so a
// long quiet game isn't treated as abandoned after a restart.
type TouchGame struct {
	GameID string
	At     time.Time
}

// CloseGame is applied when a game leaves server memory. An active game
// becomes abandoned; finished games are kept as they are.
type CloseGame struct {
	GameID string
	At     time.Time
}

func (CreateGame) isOp()      {}
func (AddSeat) isOp()         {}
func (UpdateSeatStats) isOp() {}
func (RemoveSeat) isOp()      {}
func (AppendEvent) isOp()     {}
func (SetHost) isOp()         {}
func (FinishGame) isOp()      {}
func (TouchGame) isOp()       {}
func (CloseGame) isOp()       {}

type Store interface {
	// Apply performs ops atomically and in order.
	Apply(ctx context.Context, ops []Op) error
	// LoadActiveGame returns the active game with this code, or nil if there
	// is none. A game inactive since before activeSince is marked abandoned
	// and not returned.
	LoadActiveGame(ctx context.Context, code string, activeSince time.Time) (*LoadedGame, error)
	// ListEvents returns up to limit events with seq < beforeSeq, oldest first.
	ListEvents(ctx context.Context, gameID string, beforeSeq int64, limit int) ([]Event, error)
	// AbandonStale marks active games inactive since before activeSince as abandoned.
	AbandonStale(ctx context.Context, activeSince time.Time) (int64, error)
	Ping(ctx context.Context) error
	Close()
}
