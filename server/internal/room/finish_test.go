package room

import (
	"context"
	"testing"
	"time"

	"munchkin-tracker-server/internal/store"
)

func TestFinish_WithWinner(t *testing.T) {
	rec := &recorder{}
	m := NewManager(nil, rec)
	r, _ := m.CreateRoom()
	alice := &mockClient{id: "a"}
	mustJoin(t, r, alice, "Alice", "") // host
	bob := &mockClient{id: "b"}
	bobPlayer := mustJoin(t, r, bob, "Bob", "")

	if err := r.Finish(alice, bobPlayer.ID); err != nil {
		t.Fatal(err)
	}

	msg, ok := bob.last("game_finished")
	if !ok || msg.Status != store.StatusFinished || msg.WinnerID != bobPlayer.ID || msg.FinishedAt == 0 {
		t.Fatalf("unexpected game_finished: %+v", msg)
	}
	entry, _ := bob.last("changelog_entry")
	if e := entry.ChangeLogEntry; e.EventType != "finish" || e.PlayerName != "Alice" || e.NewValue != "Bob" {
		t.Errorf("unexpected finish entry: %+v", e)
	}

	var finish *store.FinishGame
	for _, op := range rec.all() {
		if f, ok := op.(store.FinishGame); ok {
			finish = &f
		}
	}
	if finish == nil || finish.GameID != r.ID || finish.WinnerSeatID != bobPlayer.ID {
		t.Errorf("finish not persisted: %+v", finish)
	}
}

func TestFinish_LocksTheGame(t *testing.T) {
	r := NewRoom("TEST", nil)
	alice := &mockClient{id: "a"}
	mustJoin(t, r, alice, "Alice", "")
	if err := r.Finish(alice, ""); err != nil {
		t.Fatal(err)
	}
	if msg, _ := alice.last("game_finished"); msg.WinnerID != "" {
		t.Errorf("expected no winner, got %q", msg.WinnerID)
	}

	if err := r.Finish(alice, ""); err != ErrGameFinished {
		t.Errorf("second finish: expected ErrGameFinished, got %v", err)
	}
	if err := r.UpdateStats(alice, stats(5, 0, "human")); err != ErrGameFinished {
		t.Errorf("stats after finish: expected ErrGameFinished, got %v", err)
	}
	if _, err := r.Join(&mockClient{id: "x"}, "Late", ""); err != ErrGameFinished {
		t.Errorf("new player after finish: expected ErrGameFinished, got %v", err)
	}

	// Players can still come back to see the results.
	session := sessionOf(t, alice)
	r.Disconnect(alice)
	again := &mockClient{id: "a2"}
	mustJoin(t, r, again, "Alice", session)
	state, _ := again.last("room_state")
	if state.Status != store.StatusFinished || state.FinishedAt == 0 || state.CreatedAt == 0 {
		t.Errorf("room_state should describe the finished game: %+v", state)
	}

	// Leaving a finished game doesn't rewrite its results.
	before := len(r.changelog)
	r.Leave(again)
	if len(r.changelog) != before || r.PlayerCount() != 1 {
		t.Error("leaving a finished game must not remove the player or log events")
	}
}

func TestFinish_Validation(t *testing.T) {
	r := NewRoom("TEST", nil)
	alice := &mockClient{id: "a"}
	mustJoin(t, r, alice, "Alice", "")
	if err := r.Finish(alice, "nobody"); err != ErrUnknownWinner {
		t.Errorf("expected ErrUnknownWinner, got %v", err)
	}
	if err := r.Finish(&mockClient{id: "stranger"}, ""); err != ErrNotInRoom {
		t.Errorf("expected ErrNotInRoom, got %v", err)
	}
	if state, _ := alice.last("room_state"); state.Status != store.StatusActive {
		t.Errorf("game must still be active, got %q", state.Status)
	}
}

func TestFinish_RoomClosesSoonerThanActive(t *testing.T) {
	r := NewRoom("TEST", nil)
	alice := &mockClient{id: "a"}
	mustJoin(t, r, alice, "Alice", "")
	r.Finish(alice, "")
	r.Disconnect(alice)
	if !r.CloseIfIdle(time.Now().Add(EmptyRoomTTL + time.Second)) {
		t.Error("a finished game with nobody online should close after EmptyRoomTTL")
	}
}

func TestFinish_NotRestoredAfterRestart(t *testing.T) {
	st := store.NewMemory()
	w := store.NewWriter(st)
	m := NewManager(st, w)
	r, _ := m.CreateRoom()
	alice := &mockClient{id: "a"}
	mustJoin(t, r, alice, "Alice", "")
	r.Finish(alice, "")

	m2, _ := restart(t, st, w)
	if got, _ := m2.GetRoom(context.Background(), r.Code); got != nil {
		t.Error("finished games are not brought back as active rooms")
	}
}
