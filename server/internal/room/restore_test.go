package room

import (
	"context"
	"sync"
	"testing"
	"time"

	"munchkin-tracker-server/internal/store"
)

func getRoom(t *testing.T, m *Manager, code string) *Room {
	t.Helper()
	r, err := m.GetRoom(context.Background(), code)
	if err != nil {
		t.Fatalf("get room %s: %v", code, err)
	}
	return r
}

// restart simulates a server restart: the writer is drained and a fresh
// manager (with empty memory) is created over the same store.
func restart(t *testing.T, st store.Store, w *store.Writer) (*Manager, *store.Writer) {
	t.Helper()
	if err := w.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	w2 := store.NewWriter(st)
	t.Cleanup(func() { w2.Close(context.Background()) })
	return NewManager(st, w2), w2
}

func TestRestore_GameSurvivesRestart(t *testing.T) {
	st := store.NewMemory()
	w := store.NewWriter(st)
	m := NewManager(st, w)
	r, _ := m.CreateRoom()

	alice := &mockClient{id: "a"}
	alicePlayer := mustJoin(t, r, alice, "Alice", "")
	aliceSession := sessionOf(t, alice)
	bob := &mockClient{id: "b"}
	mustJoin(t, r, bob, "Bob", "")
	if err := r.UpdateStats(alice, stats(6, 2, "dwarf")); err != nil {
		t.Fatal(err)
	}

	m2, _ := restart(t, st, w)
	restored := getRoom(t, m2, r.Code)
	if restored == nil {
		t.Fatal("game should be restored from the store")
	}
	if restored.ID != r.ID || restored.PlayerCount() != 2 || restored.HasOnline() {
		t.Fatalf("expected 2 offline players in game %s", r.ID)
	}

	alice2 := &mockClient{id: "a2"}
	p := mustJoin(t, restored, alice2, "Alice", aliceSession)
	if p.ID != alicePlayer.ID || p.Level != 6 || p.GearBonus != 2 || p.Race != "dwarf" {
		t.Errorf("Alice not restored: %+v", p)
	}

	state, _ := alice2.last("room_state")
	// 2 joins + level, gearBonus and race changes
	if len(state.ChangeLog) != 5 || state.ChangeLog[4].Field != "race" || state.ChangeLog[4].Seq != 5 {
		t.Fatalf("changelog not restored: %+v", state.ChangeLog)
	}
	var bobOffline bool
	for _, pl := range state.Players {
		if pl.Name == "Bob" && !pl.Connected {
			bobOffline = true
		}
	}
	if !bobOffline {
		t.Error("Bob should be listed as offline")
	}

	// Numbering continues where it left off.
	if err := restored.UpdateStats(alice2, stats(7, 2, "dwarf")); err != nil {
		t.Fatal(err)
	}
	if last, _ := alice2.last("changelog_entry"); last.ChangeLogEntry.Seq != 6 {
		t.Errorf("expected seq 6 after restart, got %d", last.ChangeLogEntry.Seq)
	}
}

func TestRestore_StaleGameIsNotRestored(t *testing.T) {
	st := store.NewMemory()
	old := time.Now().Add(-OfflineRoomTTL - time.Minute)
	if err := st.Apply(context.Background(), []store.Op{store.CreateGame{Game: store.Game{
		ID: "g1", Code: "STA234", Status: store.StatusActive, CreatedAt: old, LastActivityAt: old,
	}}}); err != nil {
		t.Fatal(err)
	}
	m := NewManager(st, nil)
	if getRoom(t, m, "STA234") != nil {
		t.Error("a game idle for longer than OfflineRoomTTL must not come back")
	}
}

func TestRestore_ConcurrentLoadsShareOneRoom(t *testing.T) {
	st := store.NewMemory()
	w := store.NewWriter(st)
	m := NewManager(st, w)
	r, _ := m.CreateRoom()
	mustJoin(t, r, &mockClient{id: "a"}, "Alice", "")

	m2, _ := restart(t, st, w)
	rooms := make([]*Room, 20)
	var wg sync.WaitGroup
	for i := range rooms {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rooms[i], _ = m2.GetRoom(context.Background(), r.Code)
		}()
	}
	wg.Wait()
	for _, got := range rooms {
		if got == nil || got != rooms[0] {
			t.Fatal("all concurrent loads must return the same room instance")
		}
	}
}

func TestTouchOnline(t *testing.T) {
	rec := &recorder{}
	m := NewManager(nil, rec)
	online, _ := m.CreateRoom()
	mustJoin(t, online, &mockClient{id: "a"}, "Alice", "")
	m.CreateRoom() // nobody online

	before := len(rec.all())
	m.TouchOnline(time.Now())
	ops := rec.all()[before:]
	if len(ops) != 1 {
		t.Fatalf("expected one touch, got %#v", ops)
	}
	if touch, ok := ops[0].(store.TouchGame); !ok || touch.GameID != online.ID {
		t.Errorf("expected touch for the online game, got %#v", ops[0])
	}
}
