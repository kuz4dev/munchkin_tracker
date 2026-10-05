package store

import (
	"context"
	"log"
	"sync"
	"time"
)

const (
	writerQueueSize = 4096
	maxBatchSize    = 500
	// maxOutage is how long a batch is retried while the database is
	// unreachable before it is dropped.
	maxOutage    = 2 * time.Minute
	firstBackoff = 100 * time.Millisecond
	maxBackoff   = 5 * time.Second
	applyTimeout = 10 * time.Second
)

// Writer applies ops to a Store in the background, in the order they were
// enqueued, so real-time play never waits for the database. Ops that pile up
// while a write is in progress are applied together in one transaction.
type Writer struct {
	store  Store
	queue  chan Op
	mu     sync.RWMutex // guards closed against sends on a closed queue
	closed bool
	done   chan struct{}
	sleep  func(time.Duration)
}

// flushOp is a marker that is acknowledged once everything before it is applied.
type flushOp struct{ done chan struct{} }

func (flushOp) isOp() {}

func NewWriter(s Store) *Writer {
	return newWriter(s, time.Sleep)
}

func newWriter(s Store, sleep func(time.Duration)) *Writer {
	w := &Writer{
		store: s,
		queue: make(chan Op, writerQueueSize),
		done:  make(chan struct{}),
		sleep: sleep,
	}
	go w.run()
	return w
}

// Enqueue schedules ops for writing. It only blocks if the queue is full.
// Ops enqueued after Close are dropped.
func (w *Writer) Enqueue(ops ...Op) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	if w.closed {
		log.Printf("store writer closed, dropping %d op(s)", len(ops))
		return
	}
	for _, op := range ops {
		w.queue <- op
	}
}

// Flush waits until every op enqueued before the call has been applied.
func (w *Writer) Flush(ctx context.Context) error {
	marker := flushOp{done: make(chan struct{})}
	w.mu.RLock()
	if w.closed {
		w.mu.RUnlock()
		return nil
	}
	w.queue <- marker
	w.mu.RUnlock()

	select {
	case <-marker.done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Close stops accepting ops and waits until the queue is drained.
func (w *Writer) Close(ctx context.Context) error {
	w.mu.Lock()
	if !w.closed {
		w.closed = true
		close(w.queue)
	}
	w.mu.Unlock()

	select {
	case <-w.done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (w *Writer) run() {
	defer close(w.done)
	for op := range w.queue {
		var batch []Op
		var flushes []flushOp
		add := func(op Op) {
			if f, ok := op.(flushOp); ok {
				flushes = append(flushes, f)
			} else {
				batch = append(batch, op)
			}
		}
		add(op)
	drain:
		for len(batch) < maxBatchSize {
			select {
			case op, ok := <-w.queue:
				if !ok {
					break drain
				}
				add(op)
			default:
				break drain
			}
		}

		if len(batch) > 0 {
			w.write(batch)
		}
		for _, f := range flushes {
			close(f.done)
		}
	}
}

// write applies a batch, riding out database outages. If the database is
// reachable but rejects the batch, ops are applied one by one so a single bad
// op doesn't take the rest of the batch down with it.
func (w *Writer) write(batch []Op) {
	backoff := firstBackoff
	var waited time.Duration
	for {
		err := w.apply(batch)
		if err == nil {
			return
		}
		if w.reachable() {
			log.Printf("store batch of %d op(s) failed, retrying one by one: %v", len(batch), err)
			w.writeEach(batch)
			return
		}
		if waited >= maxOutage {
			log.Printf("store unreachable for %v, dropping %d op(s): %v", waited, len(batch), err)
			return
		}
		w.sleep(backoff)
		waited += backoff
		backoff = min(backoff*2, maxBackoff)
	}
}

func (w *Writer) writeEach(batch []Op) {
	for _, op := range batch {
		if err := w.apply([]Op{op}); err != nil {
			log.Printf("store dropping %T: %v", op, err)
		}
	}
}

func (w *Writer) apply(ops []Op) error {
	ctx, cancel := context.WithTimeout(context.Background(), applyTimeout)
	defer cancel()
	return w.store.Apply(ctx, ops)
}

func (w *Writer) reachable() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return w.store.Ping(ctx) == nil
}
