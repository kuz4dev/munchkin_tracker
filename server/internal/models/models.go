package models

type Player struct {
	ID        string `json:"id"`
	SessionID string `json:"sessionId,omitempty"`
	Name      string `json:"name"`
	Level     int    `json:"level"`
	GearBonus int    `json:"gearBonus"`
	Gender    string `json:"gender"`
	Race      string `json:"race"`
	Class     string `json:"class"`
}

func (p *Player) Power() int {
	return p.Level + p.GearBonus
}

type RoomInfo struct {
	Code        string `json:"code"`
	PlayerCount int    `json:"playerCount"`
}

type ChangeLogEntry struct {
	Timestamp  int64  `json:"timestamp"`
	PlayerName string `json:"playerName"`
	EventType  string `json:"eventType"`
	Field      string `json:"field,omitempty"`
	OldValue   string `json:"oldValue,omitempty"`
	NewValue   string `json:"newValue,omitempty"`
}

// WebSocket message types

type IncomingMessage struct {
	Type       string  `json:"type"`
	RoomCode   string  `json:"roomCode,omitempty"`
	PlayerName string  `json:"playerName,omitempty"`
	SessionID  string  `json:"sessionId,omitempty"`
	Player     *Player `json:"player,omitempty"`
}

type OutgoingMessage struct {
	Type           string            `json:"type"`
	RoomCode       string            `json:"roomCode,omitempty"`
	Players        []*Player         `json:"players,omitempty"`
	Player         *Player           `json:"player,omitempty"`
	PlayerID       string            `json:"playerId,omitempty"`
	Message        string            `json:"message,omitempty"`
	ChangeLog      []*ChangeLogEntry `json:"changeLog,omitempty"`
	ChangeLogEntry *ChangeLogEntry   `json:"changeLogEntry,omitempty"`
}
