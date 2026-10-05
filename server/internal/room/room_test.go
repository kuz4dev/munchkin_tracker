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

func stats(level, gear int, race string) models.Stats {
	s := models.DefaultStats()
	s.Level, s.GearBonus, s.Race = level, gear, race
	return s
}

func TestJoin_GeneratesJoinEntry(t *testing.T) {
	r := NewRoom("TEST")
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
	r := NewRoom("TEST")
	for _, id := range []string{"a", "b", "c", "d"} {
		mustJoin(t, r, &mockClient{id: id}, "P-"+id, "")
	}
	newcomer := &mockClient{id: "z"}
	p := mustJoin(t, r, newcomer, "Zed", "")

	state, ok := newcomer.last("room_state")
	if !ok {
		t.Fatal("no room_state sent")
	}
	if state.PlayerID != "z" {
		t.Errorf("expected playerId 'z', got %q", state.PlayerID)
	}
	if state.SessionID == "" || state.SessionID != p.SessionID {
		t.Errorf("expected own sessionId in room_state, got %q", state.SessionID)
	}
	if len(state.Players) != 5 {
		t.Errorf("expected 5 players, got %d", len(state.Players))
	}
}

func TestSessionID_NeverBroadcast(t *testing.T) {
	r := NewRoom("TEST")
	alice := &mockClient{id: "p1"}
	mustJoin(t, r, alice, "Alice", "")
	bob := &mockClient{id: "p2"}
	bobPlayer := mustJoin(t, r, bob, "Bob", "")
	if err := r.UpdateStats(bob, stats(2, 0, "human")); err != nil {
		t.Fatal(err)
	}

	alice.mu.Lock()
	defer alice.mu.Unlock()
	for _, raw := range alice.messages {
		if strings.Contains(string(raw), bobPlayer.SessionID) {
			t.Fatalf("Bob's session ID leaked to Alice: %s", raw)
		}
	}
}

func TestJoin_ClientSessionIDNotTrusted(t *testing.T) {
	r := NewRoom("TEST")
	p := mustJoin(t, r, &mockClient{id: "p1"}, "Alice", "attacker-chosen")
	if p.SessionID == "attacker-chosen" {
		t.Error("unknown client-supplied session ID must not be adopted")
	}
}

func TestLeave_GeneratesLeaveEntry(t *testing.T) {
	r := NewRoom("TEST")
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

func TestDisconnect_GhostRejoinKeepsStats(t *testing.T) {
	r := NewRoom("TEST")
	alice := &mockClient{id: "p1"}
	mustJoin(t, r, alice, "Alice", "")
	bob := &mockClient{id: "p2"}
	bobPlayer := mustJoin(t, r, bob, "Bob", "")
	if err := r.UpdateStats(bob, stats(5, 3, "elf")); err != nil {
		t.Fatal(err)
	}

	r.Disconnect(bob)
	if r.PlayerCount() != 2 {
		t.Fatalf("ghost should still count, got %d players", r.PlayerCount())
	}

	alice.reset()
	bob2 := &mockClient{id: "p2-new"}
	p := mustJoin(t, r, bob2, "ignored", bobPlayer.SessionID)

	if p.Level != 5 || p.GearBonus != 3 || p.Race != "elf" || p.Name != "Bob" {
		t.Errorf("stats not restored: %+v", p)
	}
	if left, ok := alice.last("player_left"); !ok || left.PlayerID != "p2" {
		t.Errorf("Alice should be told to drop the old ID, got %+v", left)
	}
	if joined, ok := alice.last("player_joined"); !ok || joined.Player.ID != "p2-new" {
		t.Errorf("Alice should see the new ID, got %+v", joined)
	}
	if state, _ := bob2.last("room_state"); state.PlayerID != "p2-new" {
		t.Errorf("expected playerId p2-new, got %q", state.PlayerID)
	}
}

func TestJoin_TakesOverActiveSession(t *testing.T) {
	// Regression: reconnecting before the server noticed the old socket died
	// (or opening a second tab) created a duplicate player at level 1.
	r := NewRoom("TEST")
	alice := &mockClient{id: "p1"}
	mustJoin(t, r, alice, "Alice", "")
	old := &mockClient{id: "p2"}
	bob := mustJoin(t, r, old, "Bob", "")
	if err := r.UpdateStats(old, stats(4, 0, "human")); err != nil {
		t.Fatal(err)
	}

	alice.reset()
	fresh := &mockClient{id: "p2-new"}
	p := mustJoin(t, r, fresh, "Bob", bob.SessionID)

	if p.Level != 4 {
		t.Errorf("expected level 4 to be kept, got %d", p.Level)
	}
	if r.PlayerCount() != 2 {
		t.Errorf("expected 2 players (no duplicate), got %d", r.PlayerCount())
	}
	if msg, ok := old.last("error"); !ok || msg.Message != MsgSessionReplaced {
		t.Errorf("old connection should be told it was replaced, got %+v", msg)
	}
	if left, ok := alice.last("player_left"); !ok || left.PlayerID != "p2" {
		t.Errorf("Alice should drop the old ID, got %+v", left)
	}

	// The old connection can no longer act, and its eventual disconnect is a no-op.
	if err := r.UpdateStats(old, stats(9, 0, "human")); err != ErrNotInRoom {
		t.Errorf("expected ErrNotInRoom for replaced connection, got %v", err)
	}
	r.Disconnect(old)
	if r.PlayerCount() != 2 || len(r.ghosts) != 0 {
		t.Errorf("stale disconnect must not create a ghost")
	}
}

func TestJoin_SameClientTwice(t *testing.T) {
	r := NewRoom("TEST")
	c := &mockClient{id: "p1"}
	mustJoin(t, r, c, "Alice", "")
	if _, err := r.Join(c, "Alice", ""); err != ErrAlreadyInRoom {
		t.Errorf("expected ErrAlreadyInRoom, got %v", err)
	}
}

func TestUpdateStats_GeneratesDiffEntries(t *testing.T) {
	r := NewRoom("TEST")
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
}

func TestUpdateStats_MultipleDiffs(t *testing.T) {
	r := NewRoom("TEST")
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
	r := NewRoom("TEST")
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
	r := NewRoom("TEST")
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
	r := NewRoom("TEST")
	if err := r.UpdateStats(&mockClient{id: "x"}, models.DefaultStats()); err != ErrNotInRoom {
		t.Errorf("expected ErrNotInRoom, got %v", err)
	}
}

func TestChangeLog_CappedAt100(t *testing.T) {
	r := NewRoom("TEST")
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
	r := NewRoom("TEST")
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
	r := NewRoom("TEST")
	now := time.Now()
	ttl := 10 * time.Minute

	// Freshly created room with nobody in it.
	if r.CloseIfIdle(now, ttl) {
		t.Fatal("room closed before ttl")
	}
	c := &mockClient{id: "p1"}
	mustJoin(t, r, c, "Alice", "")
	if r.CloseIfIdle(now.Add(time.Hour), ttl) {
		t.Fatal("room with an active player must not close")
	}

	r.Disconnect(c)
	if r.CloseIfIdle(now.Add(time.Hour), ttl) {
		t.Fatal("room with a ghost must not close")
	}

	r.mu.Lock()
	for sid, g := range r.ghosts {
		g.timer.Stop()
		delete(r.ghosts, sid)
	}
	r.updateEmptyLocked()
	r.mu.Unlock()

	if !r.CloseIfIdle(time.Now().Add(ttl), ttl) {
		t.Fatal("empty room should close after ttl")
	}
	if _, err := r.Join(&mockClient{id: "p2"}, "Bob", ""); err != ErrRoomClosed {
		t.Errorf("closed room must reject joins, got %v", err)
	}
}
