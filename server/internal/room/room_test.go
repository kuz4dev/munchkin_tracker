package room

import (
	"encoding/json"
	"testing"

	"munchkin-tracker-server/internal/models"
)

type mockClient struct {
	id       string
	messages [][]byte
}

func (m *mockClient) ID() string       { return m.id }
func (m *mockClient) Send(data []byte) { m.messages = append(m.messages, data) }

func newTestPlayer(id, name string) *models.Player {
	return &models.Player{
		ID:        id,
		SessionID: "sess-" + id,
		Name:      name,
		Level:     1,
		GearBonus: 0,
		Gender:    "male",
		Race:      "human",
		Class:     "none",
	}
}

func TestAddClient_GeneratesJoinEntry(t *testing.T) {
	r := NewRoom("TEST")
	c := &mockClient{id: "p1"}
	player := newTestPlayer("p1", "Alice")

	r.AddClient(c, player)

	if len(r.changelog) != 1 {
		t.Fatalf("expected 1 changelog entry, got %d", len(r.changelog))
	}

	entry := r.changelog[0]
	if entry.EventType != "join" {
		t.Errorf("expected eventType 'join', got '%s'", entry.EventType)
	}
	if entry.PlayerName != "Alice" {
		t.Errorf("expected playerName 'Alice', got '%s'", entry.PlayerName)
	}
	if entry.Timestamp == 0 {
		t.Error("expected non-zero timestamp")
	}
}

func TestRemoveClient_GeneratesLeaveEntry(t *testing.T) {
	r := NewRoom("TEST")
	c := &mockClient{id: "p1"}
	player := newTestPlayer("p1", "Bob")

	r.AddClient(c, player)
	r.RemoveClient(c)

	if len(r.changelog) != 2 {
		t.Fatalf("expected 2 changelog entries (join + leave), got %d", len(r.changelog))
	}

	entry := r.changelog[1]
	if entry.EventType != "leave" {
		t.Errorf("expected eventType 'leave', got '%s'", entry.EventType)
	}
	if entry.PlayerName != "Bob" {
		t.Errorf("expected playerName 'Bob', got '%s'", entry.PlayerName)
	}
}

func TestUpdatePlayer_GeneratesDiffEntries(t *testing.T) {
	r := NewRoom("TEST")
	c := &mockClient{id: "p1"}
	player := newTestPlayer("p1", "Alice")
	r.AddClient(c, player)

	updated := &models.Player{
		ID:        "p1",
		Level:     3,
		GearBonus: 0,
		Gender:    "male",
		Race:      "human",
		Class:     "none",
	}
	r.UpdatePlayer(updated)

	// 1 join + 1 level change = 2
	if len(r.changelog) != 2 {
		t.Fatalf("expected 2 changelog entries, got %d", len(r.changelog))
	}

	entry := r.changelog[1]
	if entry.EventType != "stat_change" {
		t.Errorf("expected eventType 'stat_change', got '%s'", entry.EventType)
	}
	if entry.Field != "level" {
		t.Errorf("expected field 'level', got '%s'", entry.Field)
	}
	if entry.OldValue != "1" {
		t.Errorf("expected oldValue '1', got '%s'", entry.OldValue)
	}
	if entry.NewValue != "3" {
		t.Errorf("expected newValue '3', got '%s'", entry.NewValue)
	}
	if entry.PlayerName != "Alice" {
		t.Errorf("expected playerName 'Alice', got '%s'", entry.PlayerName)
	}
}

func TestUpdatePlayer_MultipleDiffs(t *testing.T) {
	r := NewRoom("TEST")
	c := &mockClient{id: "p1"}
	player := newTestPlayer("p1", "Alice")
	r.AddClient(c, player)

	updated := &models.Player{
		ID:        "p1",
		Level:     5,
		GearBonus: 2,
		Gender:    "male",
		Race:      "elf",
		Class:     "none",
	}
	r.UpdatePlayer(updated)

	// 1 join + 3 changes (level, gearBonus, race) = 4
	if len(r.changelog) != 4 {
		t.Fatalf("expected 4 changelog entries, got %d", len(r.changelog))
	}

	fields := map[string]bool{}
	for _, e := range r.changelog[1:] {
		fields[e.Field] = true
	}
	for _, f := range []string{"level", "gearBonus", "race"} {
		if !fields[f] {
			t.Errorf("expected field '%s' in changelog entries", f)
		}
	}
}

func TestUpdatePlayer_NoDiff_NoEntry(t *testing.T) {
	r := NewRoom("TEST")
	c := &mockClient{id: "p1"}
	player := newTestPlayer("p1", "Alice")
	r.AddClient(c, player)

	// Update with identical data
	same := &models.Player{
		ID:        "p1",
		Level:     1,
		GearBonus: 0,
		Gender:    "male",
		Race:      "human",
		Class:     "none",
	}
	r.UpdatePlayer(same)

	// Only the join entry
	if len(r.changelog) != 1 {
		t.Fatalf("expected 1 changelog entry (only join), got %d", len(r.changelog))
	}
}

func TestChangeLog_CappedAt100(t *testing.T) {
	r := NewRoom("TEST")

	// Add 110 entries directly
	r.mu.Lock()
	for i := 0; i < 110; i++ {
		r.addChangeLogEntry(&models.ChangeLogEntry{
			Timestamp:  int64(i),
			PlayerName: "Test",
			EventType:  "join",
		})
	}
	r.mu.Unlock()

	if len(r.changelog) != maxChangeLogEntries {
		t.Fatalf("expected %d entries, got %d", maxChangeLogEntries, len(r.changelog))
	}

	// Oldest entry should be the one with timestamp 10 (0-9 trimmed)
	if r.changelog[0].Timestamp != 10 {
		t.Errorf("expected oldest entry timestamp 10, got %d", r.changelog[0].Timestamp)
	}
}

func TestSendRoomState_IncludesChangeLog(t *testing.T) {
	r := NewRoom("TEST")
	c := &mockClient{id: "p1"}
	player := newTestPlayer("p1", "Alice")

	r.AddClient(c, player)

	// Find the room_state message sent to the client
	var roomState models.OutgoingMessage
	for _, msg := range c.messages {
		var out models.OutgoingMessage
		if err := json.Unmarshal(msg, &out); err != nil {
			continue
		}
		if out.Type == "room_state" {
			roomState = out
			break
		}
	}

	if roomState.Type != "room_state" {
		t.Fatal("room_state message not found in client messages")
	}

	if len(roomState.ChangeLog) != 1 {
		t.Fatalf("expected 1 changelog entry in room_state, got %d", len(roomState.ChangeLog))
	}

	if roomState.ChangeLog[0].EventType != "join" {
		t.Errorf("expected join entry, got '%s'", roomState.ChangeLog[0].EventType)
	}
}

func TestRejoinClient_GeneratesJoinEntry(t *testing.T) {
	r := NewRoom("TEST")
	c1 := &mockClient{id: "p1"}
	player := newTestPlayer("p1", "Alice")

	r.AddClient(c1, player)
	r.DisconnectClient(c1, "sess-p1")

	c2 := &mockClient{id: "p2"}
	restored, ok := r.RejoinClient(c2, "sess-p1")

	if !ok || restored == nil {
		t.Fatal("expected successful rejoin")
	}

	// 1 join (initial) + 1 join (rejoin) = 2
	if len(r.changelog) != 2 {
		t.Fatalf("expected 2 changelog entries, got %d", len(r.changelog))
	}

	if r.changelog[1].EventType != "join" {
		t.Errorf("expected rejoin entry with type 'join', got '%s'", r.changelog[1].EventType)
	}
}

func TestDisconnectClient_NoLeaveEntry(t *testing.T) {
	r := NewRoom("TEST")
	c := &mockClient{id: "p1"}
	player := newTestPlayer("p1", "Alice")

	r.AddClient(c, player)
	r.DisconnectClient(c, "sess-p1")

	// Only the initial join, no leave
	if len(r.changelog) != 1 {
		t.Fatalf("expected 1 changelog entry (only join), got %d", len(r.changelog))
	}
}
