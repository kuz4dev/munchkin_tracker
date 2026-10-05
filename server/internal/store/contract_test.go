package store

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"munchkin-tracker-server/internal/models"
)

// testStore runs the same behavioural checks against every Store
// implementation. newStore must return an empty store.
func testStore(t *testing.T, newStore func(t *testing.T) Store) {
	ctx := context.Background()
	base := time.Now().Truncate(time.Millisecond).UTC()

	newGame := func(code string, at time.Time) Game {
		return Game{ID: uuid.NewString(), Code: code, Status: StatusActive, CreatedAt: at, LastActivityAt: at}
	}
	newSeat := func(g Game, name string, at time.Time) Seat {
		return Seat{ID: uuid.NewString(), GameID: g.ID, SessionHash: "hash-" + name, Name: name, Stats: models.DefaultStats(), JoinedAt: at}
	}
	event := func(g Game, s Seat, seq int64, typ string, at time.Time) Event {
		return Event{GameID: g.ID, Seq: seq, SeatID: s.ID, PlayerName: s.Name, Type: typ, CreatedAt: at}
	}
	mustApply := func(t *testing.T, st Store, ops ...Op) {
		t.Helper()
		if err := st.Apply(ctx, ops); err != nil {
			t.Fatalf("apply: %v", err)
		}
	}

	t.Run("round trip of an active game", func(t *testing.T) {
		st := newStore(t)
		g := newGame("ROUND1", base)
		alice := newSeat(g, "Alice", base.Add(time.Second))
		bob := newSeat(g, "Bob", base.Add(2*time.Second))
		level5 := models.DefaultStats()
		level5.Level, level5.Race = 5, "elf"

		mustApply(t, st,
			CreateGame{g},
			AddSeat{alice}, AppendEvent{event(g, alice, 1, "join", base.Add(time.Second))},
			AddSeat{bob}, AppendEvent{event(g, bob, 2, "join", base.Add(2*time.Second))},
			UpdateSeatStats{SeatID: alice.ID, Stats: level5},
			AppendEvent{Event{GameID: g.ID, Seq: 3, SeatID: alice.ID, PlayerName: "Alice", Type: "stat_change",
				Field: "level", OldValue: "1", NewValue: "5", CreatedAt: base.Add(3 * time.Second)}},
			RemoveSeat{SeatID: bob.ID, At: base.Add(4 * time.Second)},
			AppendEvent{event(g, bob, 4, "leave", base.Add(4*time.Second))},
		)

		loaded, err := st.LoadActiveGame(ctx, "ROUND1", base)
		if err != nil || loaded == nil {
			t.Fatalf("load: %v, %v", loaded, err)
		}
		if loaded.Game.ID != g.ID || loaded.Game.Status != StatusActive || !loaded.Game.CreatedAt.Equal(base) {
			t.Errorf("unexpected game %+v", loaded.Game)
		}
		if !loaded.Game.LastActivityAt.Equal(base.Add(4 * time.Second)) {
			t.Errorf("last activity should follow the latest event, got %v", loaded.Game.LastActivityAt)
		}
		if len(loaded.Seats) != 1 || loaded.Seats[0].ID != alice.ID {
			t.Fatalf("expected only Alice to remain, got %+v", loaded.Seats)
		}
		a := loaded.Seats[0]
		if a.Level != 5 || a.Race != "elf" || a.SessionHash != "hash-Alice" || a.Name != "Alice" {
			t.Errorf("seat not restored: %+v", a)
		}
		if loaded.LastSeq != 4 || len(loaded.RecentEvents) != 4 {
			t.Fatalf("expected 4 events, got last=%d len=%d", loaded.LastSeq, len(loaded.RecentEvents))
		}
		e := loaded.RecentEvents[2]
		if e.Seq != 3 || e.Field != "level" || e.OldValue != "1" || e.NewValue != "5" || e.PlayerName != "Alice" ||
			!e.CreatedAt.Equal(base.Add(3*time.Second)) {
			t.Errorf("event not restored: %+v", e)
		}
	})

	t.Run("recent events are capped, history pages backwards", func(t *testing.T) {
		st := newStore(t)
		g := newGame("PAGED1", base)
		s := newSeat(g, "Alice", base)
		ops := []Op{CreateGame{g}, AddSeat{s}}
		total := RecentEventsLimit + 30
		for i := 1; i <= total; i++ {
			ops = append(ops, AppendEvent{event(g, s, int64(i), "stat_change", base.Add(time.Duration(i)*time.Millisecond))})
		}
		mustApply(t, st, ops...)

		loaded, _ := st.LoadActiveGame(ctx, "PAGED1", base)
		if len(loaded.RecentEvents) != RecentEventsLimit || loaded.RecentEvents[0].Seq != 31 || loaded.LastSeq != int64(total) {
			t.Fatalf("expected the last %d events starting at 31, got %d starting at %d",
				RecentEventsLimit, len(loaded.RecentEvents), loaded.RecentEvents[0].Seq)
		}

		page, err := st.ListEvents(ctx, g.ID, 31, 20)
		if err != nil || len(page) != 20 || page[0].Seq != 11 || page[19].Seq != 30 {
			t.Fatalf("expected seq 11..30, got %d events (%v)", len(page), err)
		}
		first, _ := st.ListEvents(ctx, g.ID, 11, 20)
		if len(first) != 10 || first[0].Seq != 1 {
			t.Fatalf("expected seq 1..10, got %d events", len(first))
		}
		none, _ := st.ListEvents(ctx, g.ID, 1, 20)
		if len(none) != 0 {
			t.Errorf("expected no events before seq 1, got %d", len(none))
		}
	})

	t.Run("stale games are abandoned, not loaded", func(t *testing.T) {
		st := newStore(t)
		old := newGame("STALE1", base.Add(-3*time.Hour))
		mustApply(t, st, CreateGame{old})

		loaded, err := st.LoadActiveGame(ctx, "STALE1", base.Add(-2*time.Hour))
		if err != nil || loaded != nil {
			t.Fatalf("stale game must not load: %v, %v", loaded, err)
		}
		// Abandoned games free their code for a new game.
		mustApply(t, st, CreateGame{newGame("STALE1", base)})
		if loaded, _ := st.LoadActiveGame(ctx, "STALE1", base.Add(-time.Hour)); loaded == nil {
			t.Error("new game with a reused code should load")
		}
	})

	t.Run("touch keeps an idle game alive", func(t *testing.T) {
		st := newStore(t)
		g := newGame("TOUCH1", base.Add(-3*time.Hour))
		mustApply(t, st, CreateGame{g}, TouchGame{GameID: g.ID, At: base})
		if loaded, _ := st.LoadActiveGame(ctx, "TOUCH1", base.Add(-time.Hour)); loaded == nil {
			t.Error("touched game should load")
		}
	})

	t.Run("abandon stale", func(t *testing.T) {
		st := newStore(t)
		mustApply(t, st,
			CreateGame{newGame("OLD001", base.Add(-5*time.Hour))},
			CreateGame{newGame("NEW001", base)},
		)
		n, err := st.AbandonStale(ctx, base.Add(-2*time.Hour))
		if err != nil || n != 1 {
			t.Fatalf("expected 1 abandoned, got %d (%v)", n, err)
		}
		if loaded, _ := st.LoadActiveGame(ctx, "OLD001", time.Time{}); loaded != nil {
			t.Error("abandoned game must not load")
		}
		if loaded, _ := st.LoadActiveGame(ctx, "NEW001", time.Time{}); loaded == nil {
			t.Error("fresh game must still load")
		}
	})

	t.Run("finished and closed games are not loaded", func(t *testing.T) {
		st := newStore(t)
		fin := newGame("FIN001", base)
		s := newSeat(fin, "Alice", base)
		closed := newGame("CLS001", base)
		mustApply(t, st,
			CreateGame{fin}, AddSeat{s},
			FinishGame{GameID: fin.ID, WinnerSeatID: s.ID, At: base.Add(time.Minute)},
			CreateGame{closed},
			CloseGame{GameID: closed.ID, At: base},
		)
		if loaded, _ := st.LoadActiveGame(ctx, "FIN001", time.Time{}); loaded != nil {
			t.Error("finished game must not load as active")
		}
		if loaded, _ := st.LoadActiveGame(ctx, "CLS001", time.Time{}); loaded != nil {
			t.Error("closed game must not load")
		}
	})

	t.Run("duplicate active code is rejected", func(t *testing.T) {
		st := newStore(t)
		mustApply(t, st, CreateGame{newGame("DUP001", base)})
		if err := st.Apply(ctx, []Op{CreateGame{newGame("DUP001", base)}}); err == nil {
			t.Error("expected an error for a second active game with the same code")
		}
	})

	t.Run("ping", func(t *testing.T) {
		if err := newStore(t).Ping(ctx); err != nil {
			t.Error(err)
		}
	})
}

func TestMemoryStore(t *testing.T) {
	testStore(t, func(t *testing.T) Store { return NewMemory() })
}
