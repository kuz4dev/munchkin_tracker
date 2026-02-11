package ws

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"

	"munchkin-tracker-server/internal/models"
	"munchkin-tracker-server/internal/room"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

type Client struct {
	id       string
	conn     *websocket.Conn
	send     chan []byte
	room     *room.Room
	manager  *room.Manager
}

func NewClient(id string, conn *websocket.Conn, manager *room.Manager) *Client {
	return &Client{
		id:      id,
		conn:    conn,
		send:    make(chan []byte, 256),
		manager: manager,
	}
}

func (c *Client) ID() string {
	return c.id
}

func (c *Client) Send(data []byte) {
	select {
	case c.send <- data:
	default:
		log.Printf("client %s send buffer full, dropping message", c.id)
	}
}

func (c *Client) ReadPump() {
	defer func() {
		if c.room != nil {
			c.room.RemoveClient(c)
			if c.room.IsEmpty() {
				c.manager.RemoveRoom(c.room.Code)
				log.Printf("room %s removed (empty)", c.room.Code)
			}
		}
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("ws error: %v", err)
			}
			return
		}
		c.handleMessage(message)
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(data []byte) {
	var msg models.IncomingMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Printf("invalid message from %s: %v", c.id, err)
		c.sendError("invalid message format")
		return
	}

	switch msg.Type {
	case "join_room":
		c.handleJoinRoom(msg)
	case "update_stats":
		c.handleUpdateStats(msg)
	case "leave_room":
		c.handleLeaveRoom()
	default:
		c.sendError("unknown message type: " + msg.Type)
	}
}

func (c *Client) handleJoinRoom(msg models.IncomingMessage) {
	if msg.RoomCode == "" || msg.PlayerName == "" {
		c.sendError("roomCode and playerName are required")
		return
	}

	r := c.manager.GetRoom(msg.RoomCode)
	if r == nil {
		c.sendError("room not found")
		return
	}

	player := &models.Player{
		ID:        c.id,
		Name:      msg.PlayerName,
		Level:     1,
		GearBonus: 0,
		Gender:    "male",
		Race:      "human",
		Class:     "none",
	}

	c.room = r
	r.AddClient(c, player)
	log.Printf("player %s (%s) joined room %s", player.Name, c.id, r.Code)
}

func (c *Client) handleUpdateStats(msg models.IncomingMessage) {
	if c.room == nil {
		c.sendError("not in a room")
		return
	}
	if msg.Player == nil {
		c.sendError("player data is required")
		return
	}

	msg.Player.ID = c.id
	c.room.UpdatePlayer(msg.Player)
}

func (c *Client) handleLeaveRoom() {
	if c.room == nil {
		return
	}
	c.room.RemoveClient(c)
	if c.room.IsEmpty() {
		c.manager.RemoveRoom(c.room.Code)
		log.Printf("room %s removed (empty)", c.room.Code)
	}
	c.room = nil
}

func (c *Client) sendError(message string) {
	msg := models.OutgoingMessage{
		Type:    "error",
		Message: message,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	c.Send(data)
}
