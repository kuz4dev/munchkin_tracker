package models

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	MinLevel      = 1
	MaxLevel      = 10
	MinGearBonus  = 0
	MaxGearBonus  = 999
	MaxNameLength = 24
)

var (
	validGenders = map[string]bool{"male": true, "female": true}
	validRaces   = map[string]bool{"human": true, "elf": true, "dwarf": true, "halfling": true}
	validClasses = map[string]bool{"none": true, "warrior": true, "wizard": true, "thief": true, "cleric": true}
)

// Stats are the player-editable fields. Clients may only change these.
type Stats struct {
	Level     int    `json:"level"`
	GearBonus int    `json:"gearBonus"`
	Gender    string `json:"gender"`
	Race      string `json:"race"`
	Class     string `json:"class"`
}

func DefaultStats() Stats {
	return Stats{Level: MinLevel, GearBonus: 0, Gender: "male", Race: "human", Class: "none"}
}

func (s Stats) Validate() error {
	if s.Level < MinLevel || s.Level > MaxLevel {
		return errors.New("level out of range")
	}
	if s.GearBonus < MinGearBonus || s.GearBonus > MaxGearBonus {
		return errors.New("gearBonus out of range")
	}
	if !validGenders[s.Gender] {
		return errors.New("invalid gender")
	}
	if !validRaces[s.Race] {
		return errors.New("invalid race")
	}
	if !validClasses[s.Class] {
		return errors.New("invalid class")
	}
	return nil
}

// Player is a seat in a game. Its ID is stable for the whole game, across
// reconnects; the connection that currently controls it is tracked separately.
type Player struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Connected bool   `json:"connected"`
	Stats
}

func (p *Player) Power() int {
	return p.Level + p.GearBonus
}

// zeroWidthJoiner is a format character kept in names because emoji
// sequences (e.g. 👨‍👩‍👧) are built with it.
const zeroWidthJoiner = '\u200D'

// NormalizeName trims whitespace, strips control and invisible formatting
// characters and validates length. Formatting characters (bidi overrides,
// zero-width spaces) would let a player reverse text in the journal or pass
// for someone else with a visually identical name.
func NormalizeName(name string) (string, error) {
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || (unicode.Is(unicode.Cf, r) && r != zeroWidthJoiner) {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("playerName is required")
	}
	if utf8.RuneCountInString(name) > MaxNameLength {
		return "", errors.New("playerName is too long")
	}
	return name, nil
}

// RoomCodeAlphabet has no look-alike characters (0/O, 1/I/L).
const RoomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

const RoomCodeLength = 6

// NormalizeRoomCode makes room codes case-insensitive.
func NormalizeRoomCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

// ValidRoomCode reports whether a normalized code could have been issued.
// Anything else is rejected before touching the database or the logs.
func ValidRoomCode(code string) bool {
	if len(code) != RoomCodeLength {
		return false
	}
	for _, r := range code {
		if !strings.ContainsRune(RoomCodeAlphabet, r) {
			return false
		}
	}
	return true
}

type RoomInfo struct {
	Code        string `json:"code"`
	PlayerCount int    `json:"playerCount"`
}

type ChangeLogEntry struct {
	// Seq is the event's position within its game, starting at 1.
	Seq        int64  `json:"seq"`
	Timestamp  int64  `json:"timestamp"`
	PlayerID   string `json:"playerId"`
	PlayerName string `json:"playerName"`
	EventType  string `json:"eventType"`
	Field      string `json:"field,omitempty"`
	OldValue   string `json:"oldValue,omitempty"`
	NewValue   string `json:"newValue,omitempty"`
}

// WebSocket message types

type IncomingMessage struct {
	Type       string `json:"type"`
	RoomCode   string `json:"roomCode,omitempty"`
	PlayerName string `json:"playerName,omitempty"`
	SessionID  string `json:"sessionId,omitempty"`
	// Player carries the new stats for update_stats. Only Stats fields are
	// read; id/name/sessionId sent by the client are ignored.
	Player *Stats `json:"player,omitempty"`
	// WinnerID is the winning player for finish_game; empty for no winner.
	WinnerID string `json:"winnerId,omitempty"`
}

type OutgoingMessage struct {
	Type     string    `json:"type"`
	RoomCode string    `json:"roomCode,omitempty"`
	Players  []*Player `json:"players,omitempty"`
	Player   *Player   `json:"player,omitempty"`
	PlayerID string    `json:"playerId,omitempty"`
	// SessionID is only set in room_state sent to the session owner.
	SessionID string `json:"sessionId,omitempty"`
	// Game lifecycle, in room_state and game_finished.
	Status         string            `json:"status,omitempty"`
	WinnerID       string            `json:"winnerId,omitempty"`
	HostID         string            `json:"hostId,omitempty"`
	CreatedAt      int64             `json:"createdAt,omitempty"`
	FinishedAt     int64             `json:"finishedAt,omitempty"`
	Message        string            `json:"message,omitempty"`
	ChangeLog      []*ChangeLogEntry `json:"changeLog,omitempty"`
	ChangeLogEntry *ChangeLogEntry   `json:"changeLogEntry,omitempty"`
}
