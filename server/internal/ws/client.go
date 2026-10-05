package ws

import (
	"encoding/json"
	"log"
	"sync"
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
	id        string
	conn      *websocket.Conn
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once
	room      *room.Room // only accessed from ReadPump goroutine
	manager   *room.Manager
}

func NewClient(id string, conn *websocket.Conn, manager *room.Manager) *Client {
	return &Client{
		id:      id,
		conn:    conn,
		send:    make(chan []byte, 256),
		done:    make(chan struct{}),
		manager: manager,
	}
}

func (c *Client) ID() string {
	return c.id
}

// Send queues a message without blocking. A client that can't keep up is
// disconnected: it will reconnect and receive a fresh room_state instead of
// silently missing updates.
func (c *Client) Send(data []byte) {
	select {
	case c.send <- data:
	case <-c.done:
	default:
		log.Printf("client %s send buffer full, closing connection", c.id)
		c.close()
	}
}

func (c *Client) close() {
	c.closeOnce.Do(func() {
		close(c.done)
		c.conn.Close()
	})
}

func (c *Client) ReadPump() {
	defer func() {
		if c.room != nil {
			c.room.Disconnect(c)
		}
		c.close()
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
		c.close()
	}()

	for {
		select {
		case message := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case <-c.done:
			return
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
		c.sendError("unknown message type")
	}
}

func (c *Client) handleJoinRoom(msg models.IncomingMessage) {
	if c.room != nil {
		c.sendError(room.ErrAlreadyInRoom.Error())
		return
	}
	name, err := models.NormalizeName(msg.PlayerName)
	if err != nil {
		c.sendError(err.Error())
		return
	}

	r := c.manager.GetRoom(msg.RoomCode)
	if r == nil {
		c.sendError(room.ErrRoomClosed.Error())
		return
	}

	player, err := r.Join(c, name, msg.SessionID)
	if err != nil {
		c.sendError(err.Error())
		return
	}
	c.room = r
	log.Printf("player %s (%s) joined room %s", player.Name, c.id, r.Code)
}

func (c *Client) handleUpdateStats(msg models.IncomingMessage) {
	if c.room == nil {
		c.sendError(room.ErrNotInRoom.Error())
		return
	}
	if msg.Player == nil {
		c.sendError("player data is required")
		return
	}
	if err := c.room.UpdateStats(c, *msg.Player); err != nil {
		c.sendError(err.Error())
	}
}

func (c *Client) handleLeaveRoom() {
	if c.room == nil {
		return
	}
	c.room.Leave(c)
	c.room = nil
}

func (c *Client) sendError(message string) {
	data, err := json.Marshal(models.OutgoingMessage{
		Type:    "error",
		Message: message,
	})
	if err != nil {
		return
	}
	c.Send(data)
}
