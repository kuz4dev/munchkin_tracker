package models

type Player struct {
	ID        string `json:"id"`
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

// WebSocket message types

type IncomingMessage struct {
	Type       string  `json:"type"`
	RoomCode   string  `json:"roomCode,omitempty"`
	PlayerName string  `json:"playerName,omitempty"`
	Player     *Player `json:"player,omitempty"`
}

type OutgoingMessage struct {
	Type     string    `json:"type"`
	RoomCode string    `json:"roomCode,omitempty"`
	Players  []*Player `json:"players,omitempty"`
	Player   *Player   `json:"player,omitempty"`
	PlayerID string    `json:"playerId,omitempty"`
	Message  string    `json:"message,omitempty"`
}
