package ws

import (
	"context"
	"encoding/json"
	"log"
	"runtime/debug"
	"sync"
	"sync/atomic"
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

	// A player taps "+" a few times a second at most; anything faster is a
	// script flooding the room (every change is broadcast and persisted).
	messagesPerSecond = 10
	messageBurst      = 30
)

// joinTimeout closes connections that never join a room (a var for tests).
var joinTimeout = 30 * time.Second

type Client struct {
	id        string
	ip        string
	hub       *Hub
	conn      *websocket.Conn
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once
	room      *room.Room // only accessed from ReadPump goroutine
	manager   *room.Manager
	joined    atomic.Bool
	limiter   tokenBucket // only accessed from ReadPump goroutine
}

func NewClient(id, ip string, conn *websocket.Conn, manager *room.Manager, hub *Hub) *Client {
	return &Client{
		id:      id,
		ip:      ip,
		hub:     hub,
		limiter: tokenBucket{rate: messagesPerSecond, burst: messageBurst},
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

// closeWith tells the client why it is being disconnected, then closes.
func (c *Client) closeWith(code int, reason string) {
	c.conn.WriteControl(websocket.CloseMessage,
		websocket.FormatCloseMessage(code, reason), time.Now().Add(time.Second))
	c.close()
}

func (c *Client) ReadPump() {
	joinTimer := time.AfterFunc(joinTimeout, func() {
		if !c.joined.Load() {
			c.closeWith(websocket.ClosePolicyViolation, "join timeout")
		}
	})
	defer func() {
		joinTimer.Stop()
		if c.room != nil {
			c.room.Disconnect(c)
		}
		c.close()
		c.hub.remove(c)
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
		if !c.limiter.allow(time.Now()) {
			log.Printf("client %s exceeded the message rate, closing", c.id)
			c.closeWith(websocket.ClosePolicyViolation, "too many messages")
			return
		}
		if !c.safeHandleMessage(message) {
			return
		}
	}
}

// safeHandleMessage keeps a bug in one handler from crashing the whole
// server: HTTP's Recoverer middleware doesn't cover WebSocket goroutines.
// It returns false if the connection should be dropped.
func (c *Client) safeHandleMessage(message []byte) (ok bool) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("panic handling message from %s: %v\n%s", c.id, r, debug.Stack())
			c.closeWith(websocket.CloseInternalServerErr, "internal error")
			ok = false
		}
	}()
	c.handleMessage(message)
	return true
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
	case "finish_game":
		c.handleFinishGame(msg)
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

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	r, err := c.manager.GetRoom(ctx, msg.RoomCode)
	if err != nil {
		log.Printf("load room %q: %v", msg.RoomCode, err)
		c.sendError("temporarily unavailable")
		return
	}
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
	c.joined.Store(true)
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

func (c *Client) handleFinishGame(msg models.IncomingMessage) {
	if c.room == nil {
		c.sendError(room.ErrNotInRoom.Error())
		return
	}
	if err := c.room.Finish(c, msg.WinnerID); err != nil {
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

// tokenBucket is a per-connection rate limiter: rate tokens per second,
// up to burst. Not safe for concurrent use.
type tokenBucket struct {
	rate, burst float64
	tokens      float64
	last        time.Time
}

func (b *tokenBucket) allow(now time.Time) bool {
	if b.last.IsZero() {
		b.tokens = b.burst
	} else {
		b.tokens = min(b.burst, b.tokens+now.Sub(b.last).Seconds()*b.rate)
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}
