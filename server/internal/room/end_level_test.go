package room

import (
	"testing"

	"munchkin-tracker-server/internal/models"
	"munchkin-tracker-server/internal/store"
)

func TestSetEndLevel(t *testing.T) {
	rec := &recorder{}
	r, _ := NewManager(nil, rec).CreateRoom()
	host := &mockClient{id: "a"}
	guest := &mockClient{id: "b"}
	mustJoin(t, r, host, "Alice", "")
	mustJoin(t, r, guest, "Bob", "")

	if state, _ := guest.last("room_state"); state.EndLevel != models.DefaultEndLevel {
		t.Fatalf("new game should end at %d, got %d", models.DefaultEndLevel, state.EndLevel)
	}
	if err := r.UpdateStats(guest, stats(11, 0, "human")); err != ErrAboveEndLevel {
		t.Fatalf("level above the end: %v", err)
	}
	if err := r.SetEndLevel(guest, 20); err != ErrNotHost {
		t.Fatalf("guest changing the end level: %v", err)
	}

	if err := r.SetEndLevel(host, 20); err != nil {
		t.Fatal(err)
	}
	if msg, _ := guest.last("end_level_changed"); msg.EndLevel != 20 {
		t.Errorf("guest should hear about it: %+v", msg)
	}
	entry, _ := guest.last("changelog_entry")
	if e := entry.ChangeLogEntry; e.EventType != "end_level" || e.OldValue != "10" || e.NewValue != "20" {
		t.Errorf("unexpected journal entry: %+v", e)
	}
	var saved *store.SetEndLevel
	for _, op := range rec.all() {
		if s, ok := op.(store.SetEndLevel); ok {
			saved = &s
		}
	}
	if saved == nil || saved.GameID != r.ID || saved.Level != 20 {
		t.Errorf("end level not persisted: %+v", saved)
	}

	// The new end level now allows higher levels, and can't drop below them
	if err := r.UpdateStats(guest, stats(15, 0, "human")); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []int{14, models.MinEndLevel - 1, models.MaxLevel + 1} {
		if err := r.SetEndLevel(host, bad); err != ErrBadEndLevel {
			t.Errorf("end level %d: %v", bad, err)
		}
	}
}

func TestRestoreRoom_KeepsEndLevel(t *testing.T) {
	r := RestoreRoom(&store.LoadedGame{Game: store.Game{ID: "g", Code: "CODE", EndLevel: 25}}, nil)
	c := &mockClient{id: "a"}
	mustJoin(t, r, c, "Alice", "")
	if state, _ := c.last("room_state"); state.EndLevel != 25 {
		t.Errorf("expected 25, got %d", state.EndLevel)
	}
}

func TestExpansionRacesAndClasses(t *testing.T) {
	for _, race := range []string{"orc", "gnome"} {
		s := models.DefaultStats()
		s.Race = race
		if err := s.Validate(); err != nil {
			t.Errorf("race %s: %v", race, err)
		}
	}
	for _, class := range []string{"bard", "ranger"} {
		s := models.DefaultStats()
		s.Class = class
		if err := s.Validate(); err != nil {
			t.Errorf("class %s: %v", class, err)
		}
	}
}

func TestBarbarianIsNotAClass(t *testing.T) {
	s := models.DefaultStats()
	s.Class = "barbarian"
	if s.Validate() == nil {
		t.Error("barbarian should be rejected")
	}
}
