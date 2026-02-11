package room

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"sync"
)

type Manager struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		rooms: make(map[string]*Room),
	}
}

func (m *Manager) CreateRoom() *Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	code := m.generateCode()
	r := NewRoom(code)
	m.rooms[code] = r
	return r
}

func (m *Manager) GetRoom(code string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rooms[code]
}

func (m *Manager) RemoveRoom(code string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rooms, code)
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
		fmt.Println("code collision, regenerating...")
	}
}
