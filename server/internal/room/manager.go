package room

import (
	"context"
	"crypto/rand"
	"errors"
	"log"
	"math/big"
	"sync"
	"time"

	"munchkin-tracker-server/internal/models"
	"munchkin-tracker-server/internal/store"
)

// MaxRooms caps total rooms in memory so room creation can't exhaust it.
const MaxRooms = 5000

var ErrTooManyRooms = errors.New("too many rooms")

// Loader brings games that aren't in memory back from the store.
type Loader interface {
	LoadActiveGame(ctx context.Context, code string, activeSince time.Time) (*store.LoadedGame, error)
}

type Manager struct {
	rooms   map[string]*Room
	mu      sync.RWMutex
	loader  Loader
	persist Persister
}

// NewManager creates a room manager. loader and persist may be nil.
func NewManager(loader Loader, persist Persister) *Manager {
	if persist == nil {
		persist = nopPersister{}
	}
	return &Manager{
		rooms:   make(map[string]*Room),
		loader:  loader,
		persist: persist,
	}
}

func (m *Manager) CreateRoom() (*Room, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(m.rooms) >= MaxRooms {
		return nil, ErrTooManyRooms
	}
	code := m.generateCode()
	r := NewRoom(code, m.persist)
	m.rooms[code] = r
	m.persist.Enqueue(store.CreateGame{Game: r.gameRecord()})
	return r, nil
}

// GetRoom returns the room with this code, loading it from the store if it
// isn't in memory (after a restart or deploy). It returns nil if there is no
// such active game.
//
// Loading lazily rather than at startup matters during deploys: the new
// instance starts while the old one still serves games, so state is read only
// once a player actually reconnects here.
func (m *Manager) GetRoom(ctx context.Context, code string) (*Room, error) {
	code = models.NormalizeRoomCode(code)
	m.mu.RLock()
	r := m.rooms[code]
	m.mu.RUnlock()
	if r != nil || m.loader == nil {
		return r, nil
	}

	loaded, err := m.loader.LoadActiveGame(ctx, code, time.Now().Add(-OfflineRoomTTL))
	if err != nil || loaded == nil {
		return nil, err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if existing := m.rooms[code]; existing != nil {
		return existing, nil // someone else loaded it meanwhile
	}
	r = RestoreRoom(loaded, m.persist)
	m.rooms[code] = r
	log.Printf("restored room %s (%d players)", code, len(loaded.Seats))
	return r, nil
}

// Cleanup removes rooms nobody has been online in for long enough
// (see EmptyRoomTTL and OfflineRoomTTL).
func (m *Manager) Cleanup(now time.Time) int {
	m.mu.Lock()
	defer m.mu.Unlock()

	removed := 0
	for code, r := range m.rooms {
		if r.CloseIfIdle(now) {
			delete(m.rooms, code)
			m.persist.Enqueue(store.CloseGame{GameID: r.ID, At: now})
			removed++
		}
	}
	return removed
}

// TouchOnline records activity for games with players online, so a long
// game without stat changes isn't mistaken for abandoned after a restart.
func (m *Manager) TouchOnline(now time.Time) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, r := range m.rooms {
		if r.HasOnline() {
			m.persist.Enqueue(store.TouchGame{GameID: r.ID, At: now})
		}
	}
}

// RunJanitor periodically removes idle rooms until stop is closed.
func (m *Manager) RunJanitor(interval time.Duration, stop <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			now := time.Now()
			if n := m.Cleanup(now); n > 0 {
				log.Printf("janitor removed %d idle room(s)", n)
			}
			m.TouchOnline(now)
		case <-stop:
			return
		}
	}
}

func (m *Manager) generateCode() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	for {
		code := make([]byte, 6)
		for i := range code {
			n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
			code[i] = chars[n.Int64()]
		}
		c := string(code)
		if _, exists := m.rooms[c]; !exists {
			return c
		}
		log.Println("code collision, regenerating...")
	}
}
