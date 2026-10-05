package store

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"
)

// Memory is a Store kept in process memory. It is used in tests and when the
// server runs without a database; games are forgotten once they close.
type Memory struct {
	mu     sync.Mutex
	games  map[string]*Game
	seats  map[string]*memSeat
	events map[string][]Event // game ID -> events in seq order
}

type memSeat struct {
	Seat
	left bool
}

func NewMemory() *Memory {
	return &Memory{
		games:  make(map[string]*Game),
		seats:  make(map[string]*memSeat),
		events: make(map[string][]Event),
	}
}

func (m *Memory) Apply(_ context.Context, ops []Op) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, op := range ops {
		if err := m.applyLocked(op); err != nil {
			return err
		}
	}
	return nil
}

func (m *Memory) applyLocked(op Op) error {
	switch op := op.(type) {
	case CreateGame:
		g := op.Game
		for _, other := range m.games {
			if other.Code == g.Code && other.Status == StatusActive {
				return fmt.Errorf("active game with code %s already exists", g.Code)
			}
		}
		m.games[g.ID] = &g
	case AddSeat:
		g := m.games[op.Seat.GameID]
		if g == nil {
			return nil // game already closed
		}
		m.seats[op.Seat.ID] = &memSeat{Seat: op.Seat}
		touch(g, op.Seat.JoinedAt)
	case UpdateSeatStats:
		if s := m.seats[op.SeatID]; s != nil {
			s.Stats = op.Stats
		}
	case RemoveSeat:
		if s := m.seats[op.SeatID]; s != nil {
			s.left = true
		}
	case AppendEvent:
		e := op.Event
		g := m.games[e.GameID]
		if g == nil {
			return nil
		}
		events := m.events[e.GameID]
		if n := len(events); n > 0 && events[n-1].Seq >= e.Seq {
			return fmt.Errorf("event seq %d out of order in game %s", e.Seq, e.GameID)
		}
		m.events[e.GameID] = append(events, e)
		touch(g, e.CreatedAt)
	case SetHost:
		if g := m.games[op.GameID]; g != nil {
			g.HostSeatID = op.SeatID
		}
	case FinishGame:
		if g := m.games[op.GameID]; g != nil && g.Status == StatusActive {
			g.Status = StatusFinished
			g.WinnerSeatID = op.WinnerSeatID
			g.FinishedAt = op.At
			g.LastActivityAt = op.At
		}
	case TouchGame:
		if g := m.games[op.GameID]; g != nil {
			touch(g, op.At)
		}
	case CloseGame:
		m.deleteGameLocked(op.GameID)
	default:
		return fmt.Errorf("unknown op %T", op)
	}
	return nil
}

// touch moves last activity forward, never back (like GREATEST in SQL).
func touch(g *Game, at time.Time) {
	if at.After(g.LastActivityAt) {
		g.LastActivityAt = at
	}
}

func (m *Memory) deleteGameLocked(gameID string) {
	delete(m.games, gameID)
	delete(m.events, gameID)
	for id, s := range m.seats {
		if s.GameID == gameID {
			delete(m.seats, id)
		}
	}
}

func (m *Memory) LoadActiveGame(_ context.Context, code string, activeSince time.Time) (*LoadedGame, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, g := range m.games {
		if g.Code != code || g.Status != StatusActive {
			continue
		}
		if g.LastActivityAt.Before(activeSince) {
			g.Status = StatusAbandoned
			return nil, nil
		}
		loaded := &LoadedGame{Game: *g}
		for _, s := range m.seats {
			if s.GameID == g.ID && !s.left {
				loaded.Seats = append(loaded.Seats, s.Seat)
			}
		}
		sort.Slice(loaded.Seats, func(i, j int) bool {
			return loaded.Seats[i].JoinedAt.Before(loaded.Seats[j].JoinedAt)
		})
		events := m.events[g.ID]
		if n := len(events); n > 0 {
			loaded.LastSeq = events[n-1].Seq
		}
		start := max(0, len(events)-RecentEventsLimit)
		loaded.RecentEvents = append([]Event(nil), events[start:]...)
		return loaded, nil
	}
	return nil, nil
}

func (m *Memory) ListEvents(_ context.Context, gameID string, beforeSeq int64, limit int) ([]Event, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	events := m.events[gameID]
	end := sort.Search(len(events), func(i int) bool { return events[i].Seq >= beforeSeq })
	start := max(0, end-limit)
	return append([]Event(nil), events[start:end]...), nil
}

func (m *Memory) AbandonStale(_ context.Context, activeSince time.Time) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var n int64
	for _, g := range m.games {
		if g.Status == StatusActive && g.LastActivityAt.Before(activeSince) {
			g.Status = StatusAbandoned
			n++
		}
	}
	return n, nil
}

func (m *Memory) Ping(context.Context) error { return nil }

func (m *Memory) Close() {}
