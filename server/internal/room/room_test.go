package room

import (
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"munchkin-tracker-server/internal/models"
)

type mockClient struct {
	id       string
	mu       sync.Mutex
	messages [][]byte
}

func (m *mockClient) ID() string { return m.id }
func (m *mockClient) Send(data []byte) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages = append(m.messages, data)
}

func (m *mockClient) decoded() []models.OutgoingMessage {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]models.OutgoingMessage, 0, len(m.messages))
	for _, raw := range m.messages {
		var msg models.OutgoingMessage
		if err := json.Unmarshal(raw, &msg); err == nil {
			out = append(out, msg)
		}
	}
	return out
}

func (m *mockClient) last(msgType string) (models.OutgoingMessage, bool) {
	msgs := m.decoded()
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Type == msgType {
			return msgs[i], true
		}
	}
	return models.OutgoingMessage{}, false
}

func (m *mockClient) reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages = nil
}

func mustJoin(t *testing.T, r *Room, c Client, name, sessionID string) *models.Player {
	t.Helper()
	p, err := r.Join(c, name, sessionID)
	if err != nil {
		t.Fatalf("join %s: %v", name, err)
	}
	return p
}

// sessionOf returns the session ID the server gave this client in room_state.
func sessionOf(t *testing.T, c *mockClient) string {
	t.Helper()
	state, ok := c.last("room_state")
	if !ok || state.SessionID == "" {
		t.Fatal("client has no session")
	}
	return state.SessionID
}

func stats(level, gear int, race string) models.Stats {
	s := models.DefaultStats()
	s.Level, s.GearBonus, s.Race = level, gear, race
	return s
}

func TestJoin_GeneratesJoinEntry(t *testing.T) {
	r := NewRoom("TEST", nil)
	mustJoin(t, r, &mockClient{id: "p1"}, "Alice", "")

	if len(r.changelog) != 1 {
		t.Fatalf("expected 1 changelog entry, got %d", len(r.changelog))
	}
	entry := r.changelog[0]
	if entry.EventType != "join" || entry.PlayerName != "Alice" || entry.Timestamp == 0 {
		t.Errorf("unexpected entry: %+v", entry)
	}
}

func TestJoin_RoomStateIdentifiesRecipient(t *testing.T) {
	// Regression: the client used to guess its own ID as "the last player in
	// room_state", but Go map iteration order is random.
	r := NewRoom("TEST", nil)
	for _, id := range []string{"a", "b", "c", "d"} {
		mustJoin(t, r, &mockClient{id: id}, "P-"+id, "")
	}
	newcomer := &mockClient{id: "z"}
	p := mustJoin(t, r, newcomer, "Zed", "")

	state, ok := newcomer.last("room_state")
	if !ok {
		t.Fatal("no room_state sent")
	}
	if state.PlayerID != p.ID {
		t.Errorf("expected playerId %q, got %q", p.ID, state.PlayerID)
	}
	if state.SessionID == "" {
		t.Error("expected own sessionId in room_state")
	}
	if len(state.Players) != 5 {
		t.Errorf("expected 5 players, got %d", len(state.Players))
	}
}

func TestSessionID_NeverBroadcast(t *testing.T) {
	r := NewRoom("TEST", nil)
	alice := &mockClient{id: "p1"}
	mustJoin(t, r, alice, "Alice", "")
	bob := &mockClient{id: "p2"}
	mustJoin(t, r, bob, "Bob", "")
	bobSession := sessionOf(t, bob)
	if err := r.UpdateStats(bob, stats(2, 0, "human")); err != nil {
		t.Fatal(err)
	}

	alice.mu.Lock()
	defer alice.mu.Unlock()
	for _, raw := range alice.messages {
		if strings.Contains(string(raw), bobSession) || strings.Contains(string(raw), HashSession(bobSession)) {
			t.Fatalf("Bob's session ID leaked to Alice: %s", raw)
		}
	}
}

func TestJoin_ClientSessionIDNotTrusted(t *testing.T) {
	r := NewRoom("TEST", nil)
	c := &mockClient{id: "p1"}
	mustJoin(t, r, c, "Alice", "attacker-chosen")
	if sessionOf(t, c) == "attacker-chosen" {
		t.Error("unknown client-supplied session ID must not be adopted")
	}
}

func TestLeave_GeneratesLeaveEntry(t *testing.T) {
	r := NewRoom("TEST", nil)
	c := &mockClient{id: "p1"}
	mustJoin(t, r, c, "Bob", "")
	r.Leave(c)

	if len(r.changelog) != 2 || r.changelog[1].EventType != "leave" || r.changelog[1].PlayerName != "Bob" {
		t.Fatalf("unexpected changelog: %+v", r.changelog)
	}
	if r.PlayerCount() != 0 {
		t.Errorf("expected 0 players, got %d", r.PlayerCount())
	}
}

func TestDisconnect_PlayerStaysOfflineAndResumes(t *testing.T) {
	r := NewRoom("TEST", nil)
	alice := &mockClient{id: "c1"}
	mustJoin(t, r, alice, "Alice", "")
	bob := &mockClient{id: "c2"}
	bobPlayer := mustJoin(t, r, bob, "Bob", "")
	bobSession := sessionOf(t, bob)
	if err := r.UpdateStats(bob, stats(5, 3, "elf")); err != nil {
		t.Fatal(err)
	}

	alice.reset()
	r.Disconnect(bob)
	if r.PlayerCount() != 2 {
		t.Fatalf("offline player must stay in the game, got %d players", r.PlayerCount())
	}
	if upd, ok := alice.last("player_updated"); !ok || upd.Player.ID != bobPlayer.ID || upd.Player.Connected {
		t.Errorf("Alice should see Bob go offline, got %+v", upd)
	}

	alice.reset()
	bob2 := &mockClient{id: "c2-new"}
	p := mustJoin(t, r, bob2, "ignored", bobSession)

	if p.ID != bobPlayer.ID {
		t.Errorf("player ID must be stable across reconnects: %q != %q", p.ID, bobPlayer.ID)
	}
	if p.Level != 5 || p.GearBonus != 3 || p.Race != "elf" || p.Name != "Bob" || !p.Connected {
		t.Errorf("player not restored: %+v", p)
	}
	if upd, ok := alice.last("player_updated"); !ok || !upd.Player.Connected {
		t.Errorf("Alice should see Bob back online, got %+v", upd)
	}
	if _, ok := alice.last("player_left"); ok {
		t.Error("reconnect must not look like leave+join")
	}
	// 2 joins + 3 stat changes; the reconnect itself adds nothing
	if len(r.changelog) != 5 {
		t.Errorf("reconnects must not be logged, changelog: %d entries", len(r.changelog))
	}
	if state, _ := bob2.last("room_state"); state.PlayerID != bobPlayer.ID || state.SessionID != bobSession {
		t.Errorf("unexpected room_state identity: %+v", state)
	}
}

func TestJoin_TakesOverActiveSession(t *testing.T) {
	// Regression: reconnecting before the server noticed the old socket died
	// (or opening a second tab) created a duplicate player at level 1.
	r := NewRoom("TEST", nil)
	alice := &mockClient{id: "p1"}
	mustJoin(t, r, alice, "Alice", "")
	old := &mockClient{id: "p2"}
	bob := mustJoin(t, r, old, "Bob", "")
	if err := r.UpdateStats(old, stats(4, 0, "human")); err != nil {
		t.Fatal(err)
	}

	alice.reset()
	fresh := &mockClient{id: "p2-new"}
	p := mustJoin(t, r, fresh, "Bob", sessionOf(t, old))

	if p.Level != 4 || p.ID != bob.ID {
		t.Errorf("expected the same player at level 4, got %+v", p)
	}
	if r.PlayerCount() != 2 {
		t.Errorf("expected 2 players (no duplicate), got %d", r.PlayerCount())
	}
	if msg, ok := old.last("error"); !ok || msg.Message != MsgSessionReplaced {
		t.Errorf("old connection should be told it was replaced, got %+v", msg)
	}
	if len(alice.decoded()) != 0 {
		t.Errorf("a takeover is invisible to others, got %+v", alice.decoded())
	}

	// The old connection can no longer act, and its eventual disconnect is a no-op.
	if err := r.UpdateStats(old, stats(9, 0, "human")); err != ErrNotInRoom {
		t.Errorf("expected ErrNotInRoom for replaced connection, got %v", err)
	}
	r.Disconnect(old)
	if !p.Connected {
		t.Error("stale disconnect must not mark the new connection offline")
	}
}

func TestJoin_SameClientTwice(t *testing.T) {
	r := NewRoom("TEST", nil)
	c := &mockClient{id: "p1"}
	mustJoin(t, r, c, "Alice", "")
	if _, err := r.Join(c, "Alice", ""); err != ErrAlreadyInRoom {
		t.Errorf("expected ErrAlreadyInRoom, got %v", err)
	}
}

func TestUpdateStats_GeneratesDiffEntries(t *testing.T) {
	r := NewRoom("TEST", nil)
	c := &mockClient{id: "p1"}
	mustJoin(t, r, c, "Alice", "")

	if err := r.UpdateStats(c, stats(3, 0, "human")); err != nil {
		t.Fatal(err)
	}

	if len(r.changelog) != 2 {
		t.Fatalf("expected 2 changelog entries, got %d", len(r.changelog))
	}
	entry := r.changelog[1]
	if entry.EventType != "stat_change" || entry.Field != "level" ||
		entry.OldValue != "1" || entry.NewValue != "3" || entry.PlayerName != "Alice" {
		t.Errorf("unexpected entry: %+v", entry)
	}
	if entry.Seq != 2 || entry.PlayerID == "" || entry.PlayerID != r.changelog[0].PlayerID {
		t.Errorf("expected seq 2 with the player's ID, got %+v", entry)
	}
}

func TestUpdateStats_MultipleDiffs(t *testing.T) {
	r := NewRoom("TEST", nil)
	c := &mockClient{id: "p1"}
	mustJoin(t, r, c, "Alice", "")

	if err := r.UpdateStats(c, stats(5, 2, "elf")); err != nil {
		t.Fatal(err)
	}

	fields := map[string]bool{}
	for _, e := range r.changelog[1:] {
		fields[e.Field] = true
	}
	if len(fields) != 3 || !fields["level"] || !fields["gearBonus"] || !fields["race"] {
		t.Errorf("unexpected fields: %v", fields)
	}
}

func TestUpdateStats_NoDiff_NoEntry(t *testing.T) {
	r := NewRoom("TEST", nil)
	c := &mockClient{id: "p1"}
	mustJoin(t, r, c, "Alice", "")
	c.reset()

	if err := r.UpdateStats(c, models.DefaultStats()); err != nil {
		t.Fatal(err)
	}
	if len(r.changelog) != 1 {
		t.Fatalf("expected only the join entry, got %d", len(r.changelog))
	}
	if _, ok := c.last("player_updated"); ok {
		t.Error("no-op update should not be broadcast")
	}
}

func TestUpdateStats_RejectsInvalid(t *testing.T) {
	r := NewRoom("TEST", nil)
	c := &mockClient{id: "p1"}
	mustJoin(t, r, c, "Alice", "")

	bad := []models.Stats{
		stats(0, 0, "human"),
		stats(11, 0, "human"),
		stats(1, -1, "human"),
		stats(1, 1000, "human"),
		stats(1, 0, "dragon"),
	}
	for _, s := range bad {
		if err := r.UpdateStats(c, s); err == nil {
			t.Errorf("expected error for %+v", s)
		}
	}
	if len(r.changelog) != 1 {
		t.Errorf("invalid updates must not be logged")
	}
}

func TestUpdateStats_NotInRoom(t *testing.T) {
	r := NewRoom("TEST", nil)
	if err := r.UpdateStats(&mockClient{id: "x"}, models.DefaultStats()); err != ErrNotInRoom {
		t.Errorf("expected ErrNotInRoom, got %v", err)
	}
}

func TestChangeLog_CappedAt100(t *testing.T) {
	r := NewRoom("TEST", nil)
	r.mu.Lock()
	for i := 0; i < 110; i++ {
		r.addChangeLogEntry(&models.ChangeLogEntry{Timestamp: int64(i), PlayerName: "Test", EventType: "join"})
	}
	r.mu.Unlock()

	if len(r.changelog) != maxChangeLogEntries {
		t.Fatalf("expected %d entries, got %d", maxChangeLogEntries, len(r.changelog))
	}
	if r.changelog[0].Timestamp != 10 {
		t.Errorf("expected oldest entry timestamp 10, got %d", r.changelog[0].Timestamp)
	}
}

func TestRoomState_IncludesChangeLog(t *testing.T) {
	r := NewRoom("TEST", nil)
	c := &mockClient{id: "p1"}
	mustJoin(t, r, c, "Alice", "")

	state, ok := c.last("room_state")
	if !ok {
		t.Fatal("no room_state")
	}
	if len(state.ChangeLog) != 1 || state.ChangeLog[0].EventType != "join" {
		t.Errorf("unexpected changelog: %+v", state.ChangeLog)
	}
}

func TestCloseIfIdle(t *testing.T) {
	now := time.Now()

	empty := NewRoom("EMPTY", nil)
	if empty.CloseIfIdle(now.Add(EmptyRoomTTL - time.Second)) {
		t.Fatal("empty room closed before EmptyRoomTTL")
	}
	if !empty.CloseIfIdle(now.Add(EmptyRoomTTL + time.Second)) {
		t.Fatal("empty room should close after EmptyRoomTTL")
	}
	if _, err := empty.Join(&mockClient{id: "x"}, "Bob", ""); err != ErrRoomClosed {
		t.Errorf("closed room must reject joins, got %v", err)
	}

	r := NewRoom("TEST", nil)
	c := &mockClient{id: "p1"}
	mustJoin(t, r, c, "Alice", "")
	if r.CloseIfIdle(now.Add(24 * time.Hour)) {
		t.Fatal("room with an online player must not close")
	}

	r.Disconnect(c)
	offlineSince := time.Now()
	if r.CloseIfIdle(offlineSince.Add(EmptyRoomTTL + time.Second)) {
		t.Fatal("game with offline players must survive EmptyRoomTTL")
	}
	if !r.CloseIfIdle(offlineSince.Add(OfflineRoomTTL + time.Second)) {
		t.Fatal("game with all players offline should close after OfflineRoomTTL")
	}
}
