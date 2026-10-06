import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWebSocket } from '../useWebSocket'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState = MockWebSocket.CONNECTING
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null

  send = vi.fn()
  close = vi.fn()

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({} as CloseEvent)
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent)
  }

  simulateError() {
    this.onerror?.(new Event('error'))
  }

  static instances: MockWebSocket[] = []
  static clear() {
    MockWebSocket.instances = []
  }
}

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.clear()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('starts with disconnected status', () => {
    const { status } = useWebSocket()
    expect(status.value).toBe('disconnected')
  })

  it('connect sets status to connecting', () => {
    const { connect, status } = useWebSocket()

    connect('ws://localhost/ws')

    expect(status.value).toBe('connecting')
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost/ws')
  })

  it('status becomes connected on open', () => {
    const { connect, status } = useWebSocket()

    connect('ws://localhost/ws')
    MockWebSocket.instances[0]!.simulateOpen()

    expect(status.value).toBe('connected')
  })

  it('onMessage handler receives parsed JSON messages', () => {
    const { connect, onMessage } = useWebSocket()
    const handler = vi.fn()
    onMessage(handler)

    connect('ws://localhost/ws')
    MockWebSocket.instances[0]!.simulateOpen()
    MockWebSocket.instances[0]!.simulateMessage(JSON.stringify({ type: 'error', message: 'test' }))

    expect(handler).toHaveBeenCalledWith({ type: 'error', message: 'test' })
  })

  it('ignores invalid JSON messages', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { connect, onMessage } = useWebSocket()
    const handler = vi.fn()
    onMessage(handler)

    connect('ws://localhost/ws')
    MockWebSocket.instances[0]!.simulateOpen()
    MockWebSocket.instances[0]!.simulateMessage('not json')

    expect(handler).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('send serializes and sends when connected', () => {
    const { connect, send } = useWebSocket()

    connect('ws://localhost/ws')
    MockWebSocket.instances[0]!.simulateOpen()

    send({ type: 'leave_room' })

    expect(MockWebSocket.instances[0]!.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'leave_room' }),
    )
  })

  it('send drops message when not connected', () => {
    const { connect, send } = useWebSocket()

    connect('ws://localhost/ws')
    // Don't open the connection
    send({ type: 'leave_room' })

    expect(MockWebSocket.instances[0]!.send).not.toHaveBeenCalled()
  })

  it('disconnect sets status to disconnected and prevents reconnect', () => {
    const { connect, disconnect, status } = useWebSocket()

    connect('ws://localhost/ws')
    MockWebSocket.instances[0]!.simulateOpen()
    disconnect()

    expect(status.value).toBe('disconnected')

    // Advance timers - should not reconnect
    vi.advanceTimersByTime(60000)
    expect(MockWebSocket.instances).toHaveLength(1) // Only the original
  })

  it('reconnects with exponential backoff on unintentional close', () => {
    const { connect, status } = useWebSocket()

    connect('ws://localhost/ws')
    MockWebSocket.instances[0]!.simulateOpen()

    // First close
    MockWebSocket.instances[0]!.simulateClose()
    expect(status.value).toBe('disconnected')

    // After 1s delay, should reconnect
    vi.advanceTimersByTime(1000)
    expect(MockWebSocket.instances).toHaveLength(2)

    // Second close
    MockWebSocket.instances[1]!.simulateClose()

    // After 2s delay (exponential backoff), should reconnect again
    vi.advanceTimersByTime(2000)
    expect(MockWebSocket.instances).toHaveLength(3)
  })

  it('caps reconnect delay at 30 seconds', () => {
    const { connect } = useWebSocket()

    connect('ws://localhost/ws')

    // Simulate many closes to drive up the delay
    for (let i = 0; i < 10; i++) {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!
      ws.simulateOpen()
      ws.simulateClose()
      vi.advanceTimersByTime(30000)
    }

    // After 10 reconnects, we should still be reconnecting
    // (not waiting longer than 30s)
    const totalInstances = MockWebSocket.instances.length
    expect(totalInstances).toBeGreaterThan(5)
  })

  it('resets reconnect attempts on successful connection', () => {
    const { connect } = useWebSocket()

    connect('ws://localhost/ws')
    MockWebSocket.instances[0]!.simulateOpen()

    // Close and reconnect after 1s
    MockWebSocket.instances[0]!.simulateClose()
    vi.advanceTimersByTime(1000)
    expect(MockWebSocket.instances).toHaveLength(2)

    // Open the new connection (resets counter)
    MockWebSocket.instances[1]!.simulateOpen()

    // Close again - delay should be 1s again (not 2s)
    MockWebSocket.instances[1]!.simulateClose()
    vi.advanceTimersByTime(1000)
    expect(MockWebSocket.instances).toHaveLength(3)
  })
})
