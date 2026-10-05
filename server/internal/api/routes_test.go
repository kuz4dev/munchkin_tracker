package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"munchkin-tracker-server/internal/models"
	"munchkin-tracker-server/internal/room"
	"munchkin-tracker-server/internal/store"
)

type nopClient struct{ id string }

func (c nopClient) ID() string  { return c.id }
func (nopClient) Send(_ []byte) {}

// setup creates a room whose player made `changes` stat changes, so the game
// has 1 + changes events, all flushed to the store.
func setup(t *testing.T, changes int) (http.Handler, string) {
	t.Helper()
	st := store.NewMemory()
	w := store.NewWriter(st)
	t.Cleanup(func() { w.Close(context.Background()) })
	m := room.NewManager(st, w)
	rm, _ := m.CreateRoom()
	c := nopClient{"c1"}
	if _, err := rm.Join(c, "Alice", ""); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < changes; i++ {
		s := models.DefaultStats()
		s.GearBonus = i + 1
		if err := rm.UpdateStats(c, s); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Flush(context.Background()); err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	RegisterRoutes(r, m, st)
	return r, rm.Code
}

func get(t *testing.T, h http.Handler, url string) (*httptest.ResponseRecorder, eventsPage) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, url, nil))
	var page eventsPage
	if rec.Code == http.StatusOK {
		if err := json.NewDecoder(rec.Body).Decode(&page); err != nil {
			t.Fatal(err)
		}
	}
	return rec, page
}

func TestListEvents_Pages(t *testing.T) {
	h, code := setup(t, 149) // 150 events

	_, page := get(t, h, "/api/rooms/"+code+"/events?before=51&limit=20")
	if len(page.Events) != 20 || page.Events[0].Seq != 31 || page.Events[19].Seq != 50 || !page.HasMore {
		t.Fatalf("expected seq 31..50 with more, got %d events from %d (more=%v)",
			len(page.Events), page.Events[0].Seq, page.HasMore)
	}
	if page.Events[0].PlayerName != "Alice" || page.Events[0].PlayerID == "" {
		t.Errorf("events should carry the player: %+v", page.Events[0])
	}

	_, first := get(t, h, "/api/rooms/"+code+"/events?before=21&limit=20")
	if len(first.Events) != 20 || first.Events[0].Seq != 1 || first.HasMore {
		t.Fatalf("expected seq 1..20 and no more, got %d (more=%v)", len(first.Events), first.HasMore)
	}
	_, last := get(t, h, "/api/rooms/"+code+"/events?before=11")
	if len(last.Events) != 10 || last.Events[0].Seq != 1 || last.HasMore {
		t.Fatalf("expected the first 10 events and no more, got %d (more=%v)", len(last.Events), last.HasMore)
	}

	_, empty := get(t, h, "/api/rooms/"+code+"/events?before=1")
	if empty.Events == nil || len(empty.Events) != 0 || empty.HasMore {
		t.Errorf("expected an empty list, got %+v", empty)
	}
}

func TestListEvents_Errors(t *testing.T) {
	h, code := setup(t, 1)
	cases := map[string]int{
		"/api/rooms/" + code + "/events":                    http.StatusBadRequest,
		"/api/rooms/" + code + "/events?before=0":           http.StatusBadRequest,
		"/api/rooms/" + code + "/events?before=x":           http.StatusBadRequest,
		"/api/rooms/" + code + "/events?before=5&limit=0":   http.StatusBadRequest,
		"/api/rooms/" + code + "/events?before=5&limit=201": http.StatusBadRequest,
		"/api/rooms/NOPE00/events?before=5":                 http.StatusNotFound,
	}
	for url, want := range cases {
		if rec, _ := get(t, h, url); rec.Code != want {
			t.Errorf("%s: expected %d, got %d", url, want, rec.Code)
		}
	}
}

type fakePinger struct{ err error }

func (f fakePinger) Ping(context.Context) error { return f.err }

func TestHealth(t *testing.T) {
	ok := httptest.NewRecorder()
	Health(fakePinger{}).ServeHTTP(ok, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if ok.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", ok.Code)
	}

	down := httptest.NewRecorder()
	Health(fakePinger{err: context.DeadlineExceeded}).ServeHTTP(down, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if down.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 when the database is down, got %d", down.Code)
	}
}

func TestReadEndpointsAreRateLimited(t *testing.T) {
	h, code := setup(t, 0)
	var last int
	for i := 0; i <= readLimit; i++ {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/rooms/"+code, nil))
		last = rec.Code
	}
	if last != http.StatusTooManyRequests {
		t.Errorf("expected 429 after %d reads, got %d", readLimit, last)
	}
}
