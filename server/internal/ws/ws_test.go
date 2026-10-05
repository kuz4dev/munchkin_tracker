package ws

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"munchkin-tracker-server/internal/models"
	"munchkin-tracker-server/internal/room"
)

func newServer(t *testing.T, m *room.Manager, hub *Hub) string {
	t.Helper()
	srv := httptest.NewServer(HandleWebSocket(m, hub, nil))
	t.Cleanup(srv.Close)
	return "ws" + strings.TrimPrefix(srv.URL, "http")
}

func dial(t *testing.T, url string) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	conn, resp, err := websocket.DefaultDialer.Dial(url, nil)
	if err == nil {
		t.Cleanup(func() { conn.Close() })
	}
	return conn, resp, err
}

func mustDial(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	conn, _, err := dial(t, url)
	if err != nil {
		t.Fatal(err)
	}
	return conn
}

func send(t *testing.T, conn *websocket.Conn, msg any) {
	t.Helper()
	if err := conn.WriteJSON(msg); err != nil {
		t.Fatal(err)
	}
}

// readUntilClosed reads until the server closes the connection and returns
// the close code (0 if the read deadline hit first).
func readUntilClosed(t *testing.T, conn *websocket.Conn, within time.Duration) int {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(within))
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			if ce, ok := err.(*websocket.CloseError); ok {
				return ce.Code
			}
			return 0
		}
	}
}

func joinRoom(t *testing.T, url string, m *room.Manager, code, name string) *websocket.Conn {
	t.Helper()
	conn := mustDial(t, url)
	send(t, conn, map[string]string{"type": "join_room", "roomCode": code, "playerName": name})
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	for {
		var msg models.OutgoingMessage
		if err := conn.ReadJSON(&msg); err != nil {
			t.Fatalf("waiting for room_state: %v", err)
		}
		if msg.Type == "room_state" {
			conn.SetReadDeadline(time.Time{})
			return conn
		}
		if msg.Type == "error" {
			t.Fatalf("join failed: %s", msg.Message)
		}
	}
}

func TestFloodingClientIsDisconnected(t *testing.T) {
	m := room.NewManager(nil, nil)
	r, _ := m.CreateRoom()
	url := newServer(t, m, NewHub())
	conn := joinRoom(t, url, m, r.Code, "Alice")

	stats := models.DefaultStats()
	for i := 0; i < messageBurst+20; i++ {
		stats.GearBonus = i % 2
		if err := conn.WriteJSON(map[string]any{"type": "update_stats", "player": stats}); err != nil {
			break // already closed
		}
	}
	if code := readUntilClosed(t, conn, 3*time.Second); code != websocket.ClosePolicyViolation {
		t.Errorf("expected close %d (policy violation), got %d", websocket.ClosePolicyViolation, code)
	}
}

func TestNormalPaceIsAllowed(t *testing.T) {
	m := room.NewManager(nil, nil)
	r, _ := m.CreateRoom()
	url := newServer(t, m, NewHub())
	conn := joinRoom(t, url, m, r.Code, "Alice")

	// A burst of quick taps is fine.
	stats := models.DefaultStats()
	for i := 0; i < messageBurst-5; i++ {
		stats.GearBonus = i + 1
		send(t, conn, map[string]any{"type": "update_stats", "player": stats})
	}
	if code := readUntilClosed(t, conn, 500*time.Millisecond); code != 0 {
		t.Errorf("connection should stay open, closed with %d", code)
	}
}

func TestIdleConnectionMustJoin(t *testing.T) {
	old := joinTimeout
	joinTimeout = 100 * time.Millisecond
	t.Cleanup(func() { joinTimeout = old })

	url := newServer(t, room.NewManager(nil, nil), NewHub())
	conn := mustDial(t, url)
	if code := readUntilClosed(t, conn, 2*time.Second); code != websocket.ClosePolicyViolation {
		t.Errorf("expected close %d for not joining, got %d", websocket.ClosePolicyViolation, code)
	}
}

func TestConnectionsPerIPAreCapped(t *testing.T) {
	hub := NewHub()
	hub.maxPerIP = 2
	url := newServer(t, room.NewManager(nil, nil), hub)

	a := mustDial(t, url)
	mustDial(t, url)
	_, resp, err := dial(t, url)
	if err == nil || resp == nil || resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("third connection from the same IP should get 429, got %v %v", resp, err)
	}

	// Closing a connection frees its slot.
	a.Close()
	deadline := time.Now().Add(2 * time.Second)
	for {
		if _, _, err := dial(t, url); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("slot was not released after the connection closed")
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestPanicInHandlerDoesNotCrashServer(t *testing.T) {
	hub := NewHub()
	// A nil manager makes join_room panic inside the handler.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		HandleWebSocket(nil, hub, nil)(w, r)
	}))
	t.Cleanup(srv.Close)
	url := "ws" + strings.TrimPrefix(srv.URL, "http")

	conn := mustDial(t, url)
	send(t, conn, map[string]string{"type": "join_room", "roomCode": "ABC234", "playerName": "Alice"})
	if code := readUntilClosed(t, conn, 2*time.Second); code != websocket.CloseInternalServerErr {
		t.Errorf("expected close %d, got %d", websocket.CloseInternalServerErr, code)
	}
	// The process is still alive and serving.
	if _, _, err := dial(t, url); err != nil {
		t.Errorf("server should keep serving after a handler panic: %v", err)
	}
}

func TestTokenBucket(t *testing.T) {
	b := tokenBucket{rate: 10, burst: 3}
	now := time.Unix(0, 0)
	for i := 0; i < 3; i++ {
		if !b.allow(now) {
			t.Fatalf("burst message %d should pass", i)
		}
	}
	if b.allow(now) {
		t.Error("4th instant message should be limited")
	}
	if !b.allow(now.Add(100 * time.Millisecond)) {
		t.Error("one token refills after 100ms at 10/s")
	}
}

func TestErrorMessagesAreJSON(t *testing.T) {
	url := newServer(t, room.NewManager(nil, nil), NewHub())
	conn := mustDial(t, url)
	send(t, conn, map[string]string{"type": "join_room", "roomCode": "bad code\n", "playerName": "A"})
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var msg models.OutgoingMessage
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatal(err)
	}
	if msg.Type != "error" || msg.Message != room.ErrRoomClosed.Error() {
		t.Errorf("malformed code should look like an unknown room: %+v", msg)
	}
}
