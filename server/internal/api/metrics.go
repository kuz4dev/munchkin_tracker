package api

import (
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"

	"munchkin-tracker-server/internal/store"
)

const (
	metricsLimit   = 30
	metricsWindow  = time.Minute
	maxMetricsBody = 256
)

// metricEvents are the counters the web app may bump. Anything else is
// rejected, so the table can't be filled with arbitrary names.
var metricEvents = map[string]bool{
	"visit":            true, // the site opened in a browser tab
	"launch_installed": true, // the installed app opened from its icon
	"install_click":    true, // the "install" button was pressed
	"install_accepted": true, // the browser's install dialog was confirmed
	"invite":           true, // a room link was shared or copied
}

type metricKey struct {
	day   string
	event string
}

// Metrics counts anonymous app events in memory and hands them to the store
// in batches, so a burst of page views never queues up behind game writes.
// Its size is bounded by days × known events.
type Metrics struct {
	mu     sync.Mutex
	counts map[metricKey]int64
	now    func() time.Time
}

func NewMetrics() *Metrics {
	return &Metrics{counts: make(map[metricKey]int64), now: time.Now}
}

func (m *Metrics) add(event string) {
	key := metricKey{day: m.now().UTC().Format(time.DateOnly), event: event}
	m.mu.Lock()
	m.counts[key]++
	m.mu.Unlock()
}

// Flush passes everything counted so far to enqueue as store ops.
func (m *Metrics) Flush(enqueue func(...store.Op)) {
	m.mu.Lock()
	counts := m.counts
	m.counts = make(map[metricKey]int64)
	m.mu.Unlock()

	ops := make([]store.Op, 0, len(counts))
	for key, n := range counts {
		day, err := time.Parse(time.DateOnly, key.day)
		if err != nil {
			continue
		}
		ops = append(ops, store.CountMetric{Day: day, Event: key.event, Count: n})
	}
	if len(ops) > 0 {
		enqueue(ops...)
	}
}

// Run flushes every interval until stop is closed. The caller flushes once
// more on shutdown.
func (m *Metrics) Run(interval time.Duration, stop <-chan struct{}, enqueue func(...store.Op)) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			m.Flush(enqueue)
		case <-stop:
			return
		}
	}
}

// trackMetric accepts {"event": "..."}. The app sends it with
// navigator.sendBeacon (text/plain), which needs no CORS preflight.
func trackMetric(m *Metrics) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Event string `json:"event"`
		}
		data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxMetricsBody))
		if err != nil || json.Unmarshal(data, &body) != nil || !metricEvents[body.Event] {
			writeError(w, http.StatusBadRequest, "unknown event")
			return
		}
		m.add(body.Event)
		w.WriteHeader(http.StatusNoContent)
	}
}
