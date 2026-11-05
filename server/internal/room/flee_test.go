package room

import (
	"strconv"
	"testing"

	"munchkin-tracker-server/internal/models"
	"munchkin-tracker-server/internal/store"
)

func TestFlee_RollIsSeenByTheWholeTable(t *testing.T) {
	r := NewRoom("TEST", nil)
	alice := &mockClient{id: "a"}
	bob := &mockClient{id: "b"}
	mustJoin(t, r, alice, "Alice", "")
	mustJoin(t, r, bob, "Bob", "")

	seen := map[int]bool{}
	for range 200 {
		if err := r.Flee(alice); err != nil {
			t.Fatal(err)
		}
		msg, _ := bob.last("changelog_entry")
		e := msg.ChangeLogEntry
		roll, err := strconv.Atoi(e.NewValue)
		if e.EventType != "flee" || e.PlayerName != "Alice" || err != nil || roll < 1 || roll > 6 {
			t.Fatalf("unexpected flee entry: %+v", e)
		}
		seen[roll] = true
	}
	if len(seen) != 6 {
		t.Errorf("200 rolls should hit every face, got %v", seen)
	}
}

func TestDie(t *testing.T) {
	cases := []struct {
		name      string
		loseLevel bool
		wantLevel int
		wantNew   string
	}{
		{"gear and level", true, models.MinLevel, "1/0"},
		{"gear only", false, 7, "7/0"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := &recorder{}
			r, _ := NewManager(nil, rec).CreateRoom()
			alice := &mockClient{id: "a"}
			bob := &mockClient{id: "b"}
			p := mustJoin(t, r, alice, "Alice", "")
			mustJoin(t, r, bob, "Bob", "")
			elf := stats(7, 5, "elf")
			if err := r.UpdateStats(alice, elf); err != nil {
				t.Fatal(err)
			}

			if err := r.Die(alice, tc.loseLevel); err != nil {
				t.Fatal(err)
			}

			updated, _ := bob.last("player_updated")
			got := updated.Player
			if got.Level != tc.wantLevel || got.GearBonus != 0 || got.Race != "elf" {
				t.Errorf("unexpected player after death: %+v", got)
			}
			msg, _ := bob.last("changelog_entry")
			if e := msg.ChangeLogEntry; e.EventType != "die" || e.OldValue != "7/5" || e.NewValue != tc.wantNew {
				t.Errorf("unexpected die entry: %+v", e)
			}
			var saved *store.UpdateSeatStats
			for _, op := range rec.all() {
				if u, ok := op.(store.UpdateSeatStats); ok {
					saved = &u
				}
			}
			if saved == nil || saved.SeatID != p.ID || saved.Stats.Level != tc.wantLevel || saved.Stats.GearBonus != 0 {
				t.Errorf("death not persisted: %+v", saved)
			}
		})
	}
}

func TestFleeAndDie_RequireAnActiveSeat(t *testing.T) {
	r := NewRoom("TEST", nil)
	alice := &mockClient{id: "a"}
	stranger := &mockClient{id: "x"}
	mustJoin(t, r, alice, "Alice", "")

	if err := r.Flee(stranger); err != ErrNotInRoom {
		t.Errorf("flee as stranger: %v", err)
	}
	if err := r.Die(stranger, true); err != ErrNotInRoom {
		t.Errorf("die as stranger: %v", err)
	}
	if err := r.Finish(alice, ""); err != nil {
		t.Fatal(err)
	}
	if err := r.Flee(alice); err != ErrGameFinished {
		t.Errorf("flee after finish: %v", err)
	}
	if err := r.Die(alice, true); err != ErrGameFinished {
		t.Errorf("die after finish: %v", err)
	}
}
