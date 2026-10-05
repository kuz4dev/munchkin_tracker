import type { ClientMessage, ServerMessage } from './protocol'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

/** A WebSocket to the game server that reconnects on its own. */
export interface Connection {
  readonly status: ConnectionStatus
  connect(): void
  /** Closes for good: no automatic reconnect until connect() is called again. */
  disconnect(): void
  /** Skips the backoff wait, e.g. when the app returns to the foreground. */
  reconnectNow(): void
  /** Drops the message if not connected (the server state wins on reconnect). */
  send(message: ClientMessage): void
  onMessage(handler: (message: ServerMessage) => void): () => void
  onStatus(handler: (status: ConnectionStatus) => void): () => void
}

type WebSocketLike = Pick<WebSocket, 'readyState' | 'send' | 'close'> & {
  onopen: ((ev: unknown) => void) | null
  onclose: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onerror: ((ev: unknown) => void) | null
}

export interface ConnectionOptions {
  /** Defaults to the global WebSocket (browsers and React Native both have one) */
  createSocket?: (url: string) => WebSocketLike
  maxReconnectDelay?: number
}

const OPEN = 1
const CONNECTING = 0

export function createConnection(url: string, options: ConnectionOptions = {}): Connection {
  const createSocket = options.createSocket ?? ((u: string) => new WebSocket(u) as unknown as WebSocketLike)
  const maxReconnectDelay = options.maxReconnectDelay ?? 30_000

  let status: ConnectionStatus = 'disconnected'
  let ws: WebSocketLike | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let wanted = false // true between connect() and disconnect()
  const messageHandlers = new Set<(m: ServerMessage) => void>()
  const statusHandlers = new Set<(s: ConnectionStatus) => void>()

  function setStatus(next: ConnectionStatus) {
    if (status === next) return
    status = next
    for (const h of statusHandlers) h(next)
  }

  function cleanup() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.onopen = null
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null
      if (ws.readyState === OPEN || ws.readyState === CONNECTING) ws.close()
      ws = null
    }
  }

  function open() {
    cleanup()
    setStatus('connecting')
    const socket = createSocket(url)
    ws = socket

    socket.onopen = () => {
      reconnectAttempts = 0
      setStatus('connected')
    }
    socket.onmessage = (event) => {
      let message: ServerMessage
      try {
        message = JSON.parse(String(event.data)) as ServerMessage
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
        return
      }
      for (const h of messageHandlers) h(message)
    }
    socket.onclose = () => {
      ws = null
      setStatus('disconnected')
      if (wanted) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts, maxReconnectDelay)
        reconnectAttempts++
        reconnectTimer = setTimeout(open, delay)
      }
    }
    socket.onerror = () => {
      // onclose follows and schedules the reconnect
    }
  }

  return {
    get status() {
      return status
    },
    connect() {
      wanted = true
      reconnectAttempts = 0
      open()
    },
    disconnect() {
      wanted = false
      cleanup()
      setStatus('disconnected')
    },
    reconnectNow() {
      if (!wanted || status !== 'disconnected') return
      reconnectAttempts = 0
      open()
    },
    send(message) {
      if (ws?.readyState === OPEN) ws.send(JSON.stringify(message))
    },
    onMessage(handler) {
      messageHandlers.add(handler)
      return () => messageHandlers.delete(handler)
    },
    onStatus(handler) {
      statusHandlers.add(handler)
      return () => statusHandlers.delete(handler)
    },
  }
}

/** Derives the WebSocket URL from the API base URL (https → wss). */
export function webSocketUrl(apiBaseUrl: string): string {
  const url = new URL('/ws', apiBaseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
