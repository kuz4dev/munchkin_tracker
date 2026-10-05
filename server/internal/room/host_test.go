package room

import (
	"context"
	"testing"
	"time"

	"munchkin-tracker-server/internal/store"
)

func TestHost_FirstPlayerHostsAndOnlyTheyFinish(t *testing.T) {
	r := NewRoom("TEST", nil)
	alice := &mockClient{id: "a"}
	alicePlayer := mustJoin(t, r, alice, "Alice", "")
	bob := &mockClient{id: "b"}
	mustJoin(t, r, bob, "Bob", "")

	for _, c := range []*mockClient{alice, bob} {
		if state, _ := c.last("room_state"); state.HostID != alicePlayer.ID {
			t.Errorf("%s should see Alice as host, got %q", c.id, state.HostID)
		}
	}

	if err := r.Finish(bob, ""); err != ErrNotHost {
		t.Fatalf("a non-host must not finish the game, got %v", err)
	}
	if err := r.Finish(alice, ""); err != nil {
		t.Fatalf("the host finishes the game: %v", err)
	}
}

func TestHost_StaysWhileOfflinePassesOnLeave(t *testing.T) {
	r := NewRoom("TEST", nil)
	alice := &mockClient{id: "a"}
	mustJoin(t, r, alice, "Alice", "")
	time.Sleep(time.Millisecond) // distinct join times
	bob := &mockClient{id: "b"}
	bobPlayer := mustJoin(t, r, bob, "Bob", "")
	time.Sleep(time.Millisecond)
	carol := &mockClient{id: "c"}
	mustJoin(t, r, carol, "Carol", "")

	// A sleeping phone doesn't cost the host their role.
	aliceSession := sessionOf(t, alice)
	r.Disconnect(alice)
	if err := r.Finish(bob, ""); err != ErrNotHost {
		t.Fatalf("host offline: others still can't finish, got %v", err)
	}
	alice2 := &mockClient{id: "a2"}
	mustJoin(t, r, alice2, "Alice", aliceSession)

	// Leaving hands the role to the longest-seated player (Bob, not Carol).
	carol.reset()
	r.Leave(alice2)
	if msg, ok := carol.last("host_changed"); !ok || msg.HostID != bobPlayer.ID {
		t.Fatalf("expected host_changed to Bob, got %+v", msg)
	}
	if err := r.Finish(bob, ""); err != nil {
		t.Errorf("the new host can finish: %v", err)
	}
}

func TestHost_LastPlayerLeavingClearsHost(t *testing.T) {
	r := NewRoom("TEST", nil)
	alice := &mockClient{id: "a"}
	mustJoin(t, r, alice, "Alice", "")
	r.Leave(alice)

	// The next player to join an empty game becomes the host.
	bob := &mockClient{id: "b"}
	bobPlayer := mustJoin(t, r, bob, "Bob", "")
	if state, _ := bob.last("room_state"); state.HostID != bobPlayer.ID {
		t.Errorf("expected Bob to host the empty game, got %q", state.HostID)
	}
}

func TestHost_SurvivesRestart(t *testing.T) {
	st := store.NewMemory()
	w := store.NewWriter(st)
	m := NewManager(st, w)
	r, _ := m.CreateRoom()
	alice := &mockClient{id: "a"}
	alicePlayer := mustJoin(t, r, alice, "Alice", "")
	mustJoin(t, r, &mockClient{id: "b"}, "Bob", "")

	m2, _ := restart(t, st, w)
	restored := getRoom(t, m2, r.Code)
	alice2 := &mockClient{id: "a2"}
	mustJoin(t, restored, alice2, "Alice", sessionOf(t, alice))
	if state, _ := alice2.last("room_state"); state.HostID != alicePlayer.ID {
		t.Errorf("host lost on restart: %q", state.HostID)
	}
}

func TestHost_AssignedToGamesFromBeforeHosts(t *testing.T) {
	st := store.NewMemory()
	now := time.Now()
	g := store.Game{ID: "g1", Code: "LEG234", Status: store.StatusActive, CreatedAt: now, LastActivityAt: now}
	first := store.Seat{ID: "s1", GameID: "g1", SessionHash: "h1", Name: "First", JoinedAt: now}
	second := store.Seat{ID: "s2", GameID: "g1", SessionHash: "h2", Name: "Second", JoinedAt: now.Add(time.Second)}
	if err := st.Apply(context.Background(), []store.Op{
		store.CreateGame{Game: g}, store.AddSeat{Seat: second}, store.AddSeat{Seat: first},
	}); err != nil {
		t.Fatal(err)
	}

	rec := &recorder{}
	m := NewManager(st, rec)
	restored := getRoom(t, m, "LEG234")
	if restored.hostID != "s1" {
		t.Fatalf("expected the longest-seated player to host, got %q", restored.hostID)
	}
	ops := rec.all()
	if len(ops) != 1 {
		t.Fatalf("expected the new host to be persisted, got %#v", ops)
	}
	if set, ok := ops[0].(store.SetHost); !ok || set.SeatID != "s1" {
		t.Errorf("expected SetHost s1, got %#v", ops[0])
	}
}
