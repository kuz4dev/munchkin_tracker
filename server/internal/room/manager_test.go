package room

import (
	"strings"
	"testing"
	"time"
)

func TestManager_CleanupRemovesIdleRooms(t *testing.T) {
	m := NewManager(nil, nil)
	idle, _ := m.CreateRoom()
	busy, _ := m.CreateRoom()
	mustJoin(t, busy, &mockClient{id: "p1"}, "Alice", "")

	// Rooms that nobody ever joined used to leak forever.
	if n := m.Cleanup(time.Now().Add(EmptyRoomTTL)); n != 1 {
		t.Fatalf("expected 1 room removed, got %d", n)
	}
	if getRoom(t, m, idle.Code) != nil {
		t.Error("idle room should be removed")
	}
	if getRoom(t, m, busy.Code) == nil {
		t.Error("busy room should be kept")
	}
}

func TestManager_CleanupRespectsTTL(t *testing.T) {
	m := NewManager(nil, nil)
	r, _ := m.CreateRoom()
	if n := m.Cleanup(time.Now()); n != 0 {
		t.Fatalf("expected nothing removed, got %d", n)
	}
	if getRoom(t, m, r.Code) == nil {
		t.Error("room removed before ttl")
	}
}

func TestManager_GetRoomCaseInsensitive(t *testing.T) {
	m := NewManager(nil, nil)
	r, _ := m.CreateRoom()
	if getRoom(t, m, " "+strings.ToLower(r.Code)+" ") != r {
		t.Error("lookup should ignore case and spaces")
	}
}

func TestManager_MaxRooms(t *testing.T) {
	m := NewManager(nil, nil)
	for i := 0; i < MaxRooms; i++ {
		if _, err := m.CreateRoom(); err != nil {
			t.Fatalf("unexpected error at %d: %v", i, err)
		}
	}
	if _, err := m.CreateRoom(); err != ErrTooManyRooms {
		t.Errorf("expected ErrTooManyRooms, got %v", err)
	}
}
