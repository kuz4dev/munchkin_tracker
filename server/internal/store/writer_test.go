package store

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

// spyStore records applied ops and can be made to block or fail.
type spyStore struct {
	*Memory
	mu         sync.Mutex
	applied    []Op
	batches    []int
	gate       chan struct{} // if set, Apply waits on it
	entered    chan struct{} // if set, signalled when Apply starts waiting on gate
	badSeq     int64         // AppendEvent with this seq is rejected
	downChecks int           // number of upcoming failed Apply+Ping rounds (outage)
}

func newSpy() *spyStore { return &spyStore{Memory: NewMemory()} }

func (s *spyStore) Apply(ctx context.Context, ops []Op) error {
	if s.gate != nil {
		if s.entered != nil {
			select {
			case s.entered <- struct{}{}:
			default:
			}
		}
		<-s.gate
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.downChecks > 0 {
		return errors.New("connection refused")
	}
	for _, op := range ops {
		if e, ok := op.(AppendEvent); ok && s.badSeq != 0 && e.Event.Seq == s.badSeq {
			return errors.New("constraint violation")
		}
	}
	s.applied = append(s.applied, ops...)
	s.batches = append(s.batches, len(ops))
	return nil
}

func (s *spyStore) Ping(context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.downChecks > 0 {
		s.downChecks--
		return errors.New("connection refused")
	}
	return nil
}

func (s *spyStore) seqs() []int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []int64
	for _, op := range s.applied {
		if e, ok := op.(AppendEvent); ok {
			out = append(out, e.Event.Seq)
		}
	}
	return out
}

func ev(seq int64) Op { return AppendEvent{Event{GameID: "g", Seq: seq}} }

func TestWriter_AppliesInOrderAndFlushes(t *testing.T) {
	spy := newSpy()
	w := NewWriter(spy)
	defer w.Close(context.Background())

	for i := int64(1); i <= 1000; i++ {
		w.Enqueue(ev(i))
	}
	if err := w.Flush(context.Background()); err != nil {
		t.Fatal(err)
	}
	seqs := spy.seqs()
	if len(seqs) != 1000 {
		t.Fatalf("expected 1000 ops applied after Flush, got %d", len(seqs))
	}
	for i, s := range seqs {
		if s != int64(i+1) {
			t.Fatalf("out of order at %d: %d", i, s)
		}
	}
}

func TestWriter_CloseDrainsQueue(t *testing.T) {
	spy := newSpy()
	spy.gate = make(chan struct{})
	w := NewWriter(spy)
	for i := int64(1); i <= 50; i++ {
		w.Enqueue(ev(i))
	}

	closed := make(chan error)
	go func() { closed <- w.Close(context.Background()) }()
	close(spy.gate) // let the store make progress

	select {
	case err := <-closed:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Close did not return")
	}
	if n := len(spy.seqs()); n != 50 {
		t.Errorf("expected all 50 ops applied before Close returned, got %d", n)
	}

	w.Enqueue(ev(51)) // must not panic after Close
	if n := len(spy.seqs()); n != 50 {
		t.Errorf("ops after Close must be dropped, got %d", n)
	}
}

func TestWriter_CloseRespectsContext(t *testing.T) {
	spy := newSpy()
	spy.gate = make(chan struct{})
	defer close(spy.gate)
	w := NewWriter(spy)
	w.Enqueue(ev(1))

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if err := w.Close(ctx); err == nil {
		t.Error("expected a timeout while the store is stuck")
	}
}

func TestWriter_BatchesQueuedOps(t *testing.T) {
	spy := newSpy()
	spy.gate = make(chan struct{})
	spy.entered = make(chan struct{}, 1)
	w := NewWriter(spy)
	defer w.Close(context.Background())

	w.Enqueue(ev(1))
	<-spy.entered // the writer is busy with op 1 alone
	for i := int64(2); i <= 101; i++ {
		w.Enqueue(ev(i)) // pile up meanwhile
	}
	close(spy.gate)
	if err := w.Flush(context.Background()); err != nil {
		t.Fatal(err)
	}

	spy.mu.Lock()
	batches := append([]int(nil), spy.batches...)
	spy.mu.Unlock()
	if len(batches) != 2 || batches[0] != 1 || batches[1] != 100 {
		t.Errorf("expected batches [1 100], got %v", batches)
	}
}

func TestWriter_BadOpDoesNotDropTheBatch(t *testing.T) {
	spy := newSpy()
	spy.badSeq = 3
	spy.gate = make(chan struct{})
	w := NewWriter(spy)
	defer w.Close(context.Background())

	w.Enqueue(ev(1))
	for i := int64(2); i <= 5; i++ {
		w.Enqueue(ev(i))
	}
	close(spy.gate)
	w.Flush(context.Background())

	got := spy.seqs()
	want := []int64{1, 2, 4, 5}
	if len(got) != len(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("expected %v, got %v", want, got)
		}
	}
}

func TestWriter_RidesOutOutage(t *testing.T) {
	spy := newSpy()
	spy.downChecks = 3
	var slept []time.Duration
	var sleepMu sync.Mutex
	w := newWriter(spy, func(d time.Duration) {
		sleepMu.Lock()
		slept = append(slept, d)
		sleepMu.Unlock()
	})
	defer w.Close(context.Background())

	for i := int64(1); i <= 10; i++ {
		w.Enqueue(ev(i))
	}
	w.Flush(context.Background())

	if n := len(spy.seqs()); n != 10 {
		t.Fatalf("nothing should be lost during a short outage, got %d of 10", n)
	}
	sleepMu.Lock()
	defer sleepMu.Unlock()
	if len(slept) == 0 || slept[0] != firstBackoff || (len(slept) > 1 && slept[1] != 2*firstBackoff) {
		t.Errorf("expected exponential backoff, got %v", slept)
	}
}

func TestWriter_GivesUpAfterLongOutage(t *testing.T) {
	spy := newSpy()
	spy.downChecks = 1 << 30 // never comes back
	w := newWriter(spy, func(time.Duration) {})
	w.Enqueue(ev(1))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := w.Flush(ctx); err != nil {
		t.Fatal("writer should give up instead of blocking forever:", err)
	}
	if n := len(spy.seqs()); n != 0 {
		t.Errorf("expected nothing applied, got %d", n)
	}
	w.Close(context.Background())
}
