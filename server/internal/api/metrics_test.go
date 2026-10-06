package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"munchkin-tracker-server/internal/room"
	"munchkin-tracker-server/internal/store"
)

func TestTrackMetric(t *testing.T) {
	st := store.NewMemory()
	w := store.NewWriter(st)
	t.Cleanup(func() { w.Close(context.Background()) })
	metrics := NewMetrics()
	metrics.now = func() time.Time { return time.Date(2026, 10, 6, 23, 30, 0, 0, time.FixedZone("MSK", 3*3600)) }
	r := chi.NewRouter()
	RegisterRoutes(r, room.NewManager(st, w), st, metrics)

	post := func(body string) int {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/metrics", strings.NewReader(body))
		req.Header.Set("Content-Type", "text/plain;charset=UTF-8") // as sendBeacon sends it
		r.ServeHTTP(rec, req)
		return rec.Code
	}

	for _, body := range []string{`{"event":"visit"}`, `{"event":"visit"}`, `{"event":"install_accepted"}`} {
		if code := post(body); code != http.StatusNoContent {
			t.Fatalf("POST %s = %d, want 204", body, code)
		}
	}
	for _, body := range []string{`{"event":"drop table"}`, `not json`, `{"event":"visit"` + strings.Repeat(" ", maxMetricsBody) + `}`} {
		if code := post(body); code != http.StatusBadRequest {
			t.Fatalf("POST %.30s = %d, want 400", body, code)
		}
	}

	metrics.Flush(w.Enqueue)
	if err := w.Flush(context.Background()); err != nil {
		t.Fatal(err)
	}
	got, err := st.Metrics(context.Background(), time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	// 23:30 in Moscow is 20:30 UTC: counted on the same UTC day
	day := time.Date(2026, 10, 6, 0, 0, 0, 0, time.UTC)
	want := []store.MetricCount{{Day: day, Event: "install_accepted", Count: 1}, {Day: day, Event: "visit", Count: 2}}
	if len(got) != len(want) {
		t.Fatalf("metrics = %+v, want %+v", got, want)
	}
	for i := range want {
		if !got[i].Day.Equal(want[i].Day) || got[i].Event != want[i].Event || got[i].Count != want[i].Count {
			t.Fatalf("metrics[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}

	// Nothing new: a flush enqueues nothing
	metrics.Flush(func(ops ...store.Op) { t.Fatalf("unexpected ops %v", ops) })
}

func TestTrackMetricRateLimit(t *testing.T) {
	st := store.NewMemory()
	w := store.NewWriter(st)
	t.Cleanup(func() { w.Close(context.Background()) })
	r := chi.NewRouter()
	RegisterRoutes(r, room.NewManager(st, w), st, NewMetrics())

	var last int
	for range metricsLimit + 1 {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/metrics", strings.NewReader(`{"event":"visit"}`)))
		last = rec.Code
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("request over the limit = %d, want 429", last)
	}
}
