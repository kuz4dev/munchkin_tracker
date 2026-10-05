package room

import (
	"crypto/rand"
	"errors"
	"log"
	"math/big"
	"sync"
	"time"

	"munchkin-tracker-server/internal/models"
)

// MaxRooms caps total rooms in memory so room creation can't exhaust it.
const MaxRooms = 5000

var ErrTooManyRooms = errors.New("too many rooms")

type Manager struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		rooms: make(map[string]*Room),
	}
}

func (m *Manager) CreateRoom() (*Room, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(m.rooms) >= MaxRooms {
		return nil, ErrTooManyRooms
	}
	code := m.generateCode()
	r := NewRoom(code)
	m.rooms[code] = r
	return r, nil
}

func (m *Manager) GetRoom(code string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rooms[models.NormalizeRoomCode(code)]
}

// Cleanup removes rooms that have been empty for at least ttl.
func (m *Manager) Cleanup(ttl time.Duration) int {
	now := time.Now()
	m.mu.Lock()
	defer m.mu.Unlock()

	removed := 0
	for code, r := range m.rooms {
		if r.CloseIfIdle(now, ttl) {
			delete(m.rooms, code)
			removed++
		}
	}
	return removed
}

// RunJanitor periodically removes idle rooms until stop is closed.
func (m *Manager) RunJanitor(interval, ttl time.Duration, stop <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if n := m.Cleanup(ttl); n > 0 {
				log.Printf("janitor removed %d idle room(s)", n)
			}
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
