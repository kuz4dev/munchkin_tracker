package room

import (
	"testing"

	"munchkin-tracker-server/internal/models"
)

func TestSecondRaceAndClass(t *testing.T) {
	r := NewRoom("TEST", nil)
	c := &mockClient{id: "a"}
	mustJoin(t, r, c, "Alice", "")

	s := models.DefaultStats()
	s.Race, s.HalfBreed, s.Race2 = "elf", true, "orc"
	if err := r.UpdateStats(c, s); err != nil {
		t.Fatal(err)
	}
	entry, _ := c.last("changelog_entry")
	if e := entry.ChangeLogEntry; e.Field != "race" || e.OldValue != "human" || e.NewValue != "elf+orc" {
		t.Errorf("unexpected entry: %+v", e)
	}
	updated, _ := c.last("player_updated")
	if p := updated.Player; !p.HalfBreed || p.Race2 != "orc" {
		t.Errorf("unexpected player: %+v", p)
	}

	// Only the card changes: the race stays, so it gets its own entry
	s = updated.Player.Stats
	s.HalfBreed, s.Race2 = false, ""
	if err := r.UpdateStats(c, s); err != nil {
		t.Fatal(err)
	}
	s.HalfBreed = true
	if err := r.UpdateStats(c, s); err != nil {
		t.Fatal(err)
	}
	entry, _ = c.last("changelog_entry")
	if e := entry.ChangeLogEntry; e.Field != "halfBreed" || e.OldValue != "no" || e.NewValue != "yes" {
		t.Errorf("unexpected card entry: %+v", e)
	}

	// Death keeps both: race and class stay
	s.SuperMunchkin, s.Class, s.Class2, s.Race2 = true, "wizard", "bard", "orc"
	if err := r.UpdateStats(c, s); err != nil {
		t.Fatal(err)
	}
	if err := r.Die(c, true); err != nil {
		t.Fatal(err)
	}
	updated, _ = c.last("player_updated")
	if p := updated.Player; p.Race2 != "orc" || p.Class2 != "bard" || !p.SuperMunchkin {
		t.Errorf("death should keep race and class: %+v", p)
	}
}

func TestSecondRaceAndClass_Validation(t *testing.T) {
	bad := map[string]func(*models.Stats){
		"second race without the card":  func(s *models.Stats) { s.Race2 = "orc" },
		"second class without the card": func(s *models.Stats) { s.Class, s.Class2 = "bard", "ranger" },
		"unknown second race":           func(s *models.Stats) { s.HalfBreed, s.Race2 = true, "dragon" },
		"the same race twice":           func(s *models.Stats) { s.HalfBreed, s.Race2 = true, s.Race },
		"the same class twice":          func(s *models.Stats) { s.SuperMunchkin, s.Class, s.Class2 = true, "bard", "bard" },
		"no class as the second one":    func(s *models.Stats) { s.SuperMunchkin, s.Class, s.Class2 = true, "bard", "none" },
		"a second class after no class": func(s *models.Stats) { s.SuperMunchkin, s.Class2 = true, "bard" },
	}
	for name, change := range bad {
		s := models.DefaultStats()
		change(&s)
		if s.Validate() == nil {
			t.Errorf("%s should be rejected", name)
		}
	}
	s := models.DefaultStats()
	s.HalfBreed, s.SuperMunchkin = true, true // the cards work with just one race and class
	if err := s.Validate(); err != nil {
		t.Errorf("a card alone is fine: %v", err)
	}
}
