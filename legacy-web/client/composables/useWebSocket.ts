import { ref, type Ref } from 'vue'
import type { ClientMessage, ServerMessage } from '@/types'

export interface UseWebSocketReturn {
  status: Ref<'connecting' | 'connected' | 'disconnected'>
  connect: (url: string) => void
  disconnect: () => void
  send: (message: ClientMessage) => void
  onMessage: (handler: (message: ServerMessage) => void) => void
}

export function useWebSocket(): UseWebSocketReturn {
  const status = ref<'connecting' | 'connected' | 'disconnected'>('disconnected')

  let ws: WebSocket | null = null
  let messageHandler: ((message: ServerMessage) => void) | null = null
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let currentUrl: string | null = null
  let intentionalClose = false

  const maxReconnectDelay = 30000

  function getReconnectDelay(): number {
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay)
    return delay
  }

  function connect(url: string) {
    currentUrl = url
    intentionalClose = false
    reconnectAttempts = 0
    doConnect()
  }

  function doConnect() {
    if (!currentUrl) return

    cleanup()
    status.value = 'connecting'

    ws = new WebSocket(currentUrl)

    ws.onopen = () => {
      status.value = 'connected'
      reconnectAttempts = 0
    }

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data)
        messageHandler?.(message)
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    ws.onclose = () => {
      status.value = 'disconnected'
      ws = null

      if (!intentionalClose && currentUrl) {
        const delay = getReconnectDelay()
        reconnectAttempts++
        console.log(`WebSocket closed, reconnecting in ${delay}ms...`)
        reconnectTimeout = setTimeout(doConnect, delay)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }

  function cleanup() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    if (ws) {
      ws.onopen = null
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
      ws = null
    }
  }

  function disconnect() {
    intentionalClose = true
    currentUrl = null
    cleanup()
    status.value = 'disconnected'
  }

  function send(message: ClientMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  function onMessage(handler: (message: ServerMessage) => void) {
    messageHandler = handler
  }

  return {
    status,
    connect,
    disconnect,
    send,
    onMessage,
  }
}
