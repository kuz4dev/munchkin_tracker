package room

import (
	"sync"
	"testing"
	"time"

	"munchkin-tracker-server/internal/store"
)

type recorder struct {
	mu  sync.Mutex
	ops []store.Op
}

func (r *recorder) Enqueue(ops ...store.Op) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ops = append(r.ops, ops...)
}

func (r *recorder) all() []store.Op {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]store.Op(nil), r.ops...)
}

func TestRoom_PersistsEveryChangeInOrder(t *testing.T) {
	rec := &recorder{}
	m := NewManager(nil, rec)
	r, _ := m.CreateRoom()

	alice := &mockClient{id: "c1"}
	p := mustJoin(t, r, alice, "Alice", "")
	if err := r.UpdateStats(alice, stats(3, 1, "human")); err != nil {
		t.Fatal(err)
	}
	r.Disconnect(alice) // offline is not persisted
	alice2 := &mockClient{id: "c2"}
	mustJoin(t, r, alice2, "Alice", sessionOf(t, alice))
	r.Leave(alice2)

	ops := rec.all()
	want := []string{
		"store.CreateGame",
		"store.AddSeat", "store.AppendEvent", // join
		"store.UpdateSeatStats", "store.AppendEvent", "store.AppendEvent", // level + gear
		"store.RemoveSeat", "store.AppendEvent", // leave
	}
	if len(ops) != len(want) {
		t.Fatalf("expected %d ops, got %d: %#v", len(want), len(ops), ops)
	}
	var lastSeq int64
	for i, op := range ops {
		if got := typeName(op); got != want[i] {
			t.Errorf("op %d: expected %s, got %s", i, want[i], got)
		}
		if e, ok := op.(store.AppendEvent); ok {
			if e.Event.Seq != lastSeq+1 || e.Event.GameID != r.ID || e.Event.SeatID != p.ID {
				t.Errorf("bad event %+v", e.Event)
			}
			lastSeq = e.Event.Seq
		}
	}

	seat := ops[1].(store.AddSeat).Seat
	if seat.SessionHash == "" || seat.SessionHash == sessionOf(t, alice) {
		t.Error("the store must get the session hash, never the raw session ID")
	}
	if upd := ops[3].(store.UpdateSeatStats); upd.Stats.Level != 3 || upd.Stats.GearBonus != 1 {
		t.Errorf("unexpected stats update %+v", upd)
	}
}

func TestManager_PersistsClose(t *testing.T) {
	rec := &recorder{}
	m := NewManager(nil, rec)
	r, _ := m.CreateRoom()
	m.Cleanup(time.Now().Add(EmptyRoomTTL + time.Second))

	ops := rec.all()
	last, ok := ops[len(ops)-1].(store.CloseGame)
	if !ok || last.GameID != r.ID {
		t.Fatalf("expected CloseGame for %s, got %#v", r.ID, ops)
	}
}

func typeName(op store.Op) string {
	switch op.(type) {
	case store.CreateGame:
		return "store.CreateGame"
	case store.AddSeat:
		return "store.AddSeat"
	case store.UpdateSeatStats:
		return "store.UpdateSeatStats"
	case store.RemoveSeat:
		return "store.RemoveSeat"
	case store.AppendEvent:
		return "store.AppendEvent"
	case store.FinishGame:
		return "store.FinishGame"
	case store.TouchGame:
		return "store.TouchGame"
	case store.CloseGame:
		return "store.CloseGame"
	}
	return "unknown"
}
