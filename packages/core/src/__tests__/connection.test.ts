import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConnection, webSocketUrl, type ConnectionStatus } from '../connection'

class MockSocket {
  static instances: MockSocket[] = []
  readyState = 0
  onopen: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = 3
  })
  constructor(readonly url: string) {
    MockSocket.instances.push(this)
  }
  open() {
    this.readyState = 1
    this.onopen?.({})
  }
  drop() {
    this.readyState = 3
    this.onclose?.({})
  }
  receive(data: string) {
    this.onmessage?.({ data })
  }
}

const last = () => MockSocket.instances[MockSocket.instances.length - 1]!

function setup() {
  const conn = createConnection('ws://test/ws', { createSocket: (url) => new MockSocket(url) })
  const statuses: ConnectionStatus[] = []
  conn.onStatus((s) => statuses.push(s))
  return { conn, statuses }
}

beforeEach(() => {
  vi.useFakeTimers()
  MockSocket.instances = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createConnection', () => {
  it('goes connecting → connected', () => {
    const { conn, statuses } = setup()
    expect(conn.status).toBe('disconnected')
    conn.connect()
    expect(last().url).toBe('ws://test/ws')
    last().open()
    expect(statuses).toEqual(['connecting', 'connected'])
  })

  it('delivers parsed messages to every handler, skipping invalid JSON', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { conn } = setup()
    const a = vi.fn()
    const b = vi.fn()
    conn.onMessage(a)
    const offB = conn.onMessage(b)
    conn.connect()
    last().open()

    last().receive('{"type":"player_left","playerId":"p1"}')
    offB()
    last().receive('not json')
    last().receive('{"type":"player_left","playerId":"p2"}')

    expect(a).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('sends JSON only while open', () => {
    const { conn } = setup()
    conn.send({ type: 'leave_room' }) // not connected: dropped
    conn.connect()
    conn.send({ type: 'leave_room' }) // still connecting: dropped
    last().open()
    conn.send({ type: 'leave_room' })
    expect(last().send).toHaveBeenCalledTimes(1)
    expect(last().send).toHaveBeenCalledWith('{"type":"leave_room"}')
  })

  it('reconnects with exponential backoff capped at 30s', () => {
    const { conn } = setup()
    conn.connect()
    const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000]
    for (const delay of delays) {
      const before = MockSocket.instances.length
      last().drop()
      vi.advanceTimersByTime(delay - 1)
      expect(MockSocket.instances.length).toBe(before)
      vi.advanceTimersByTime(1)
      expect(MockSocket.instances.length).toBe(before + 1)
    }
  })

  it('resets the backoff after a successful connection', () => {
    const { conn } = setup()
    conn.connect()
    last().drop()
    vi.advanceTimersByTime(1000)
    last().drop()
    vi.advanceTimersByTime(2000)
    last().open()
    const before = MockSocket.instances.length
    last().drop()
    vi.advanceTimersByTime(1000)
    expect(MockSocket.instances.length).toBe(before + 1)
  })

  it('disconnect closes for good', () => {
    const { conn, statuses } = setup()
    conn.connect()
    last().open()
    const socket = last()
    conn.disconnect()
    expect(socket.close).toHaveBeenCalled()
    expect(statuses.at(-1)).toBe('disconnected')
    vi.advanceTimersByTime(60_000)
    expect(MockSocket.instances).toHaveLength(1)
  })

  it('reconnectNow skips the backoff wait (app back in foreground)', () => {
    const { conn } = setup()
    conn.connect()
    for (let i = 0; i < 5; i++) {
      last().drop()
      vi.advanceTimersByTime(2 ** i * 1000)
    }
    last().drop() // next try would be in 30s
    const before = MockSocket.instances.length
    conn.reconnectNow()
    expect(MockSocket.instances.length).toBe(before + 1)
    // The pending backoff timer must not open a second socket
    vi.advanceTimersByTime(60_000)
    expect(MockSocket.instances.length).toBe(before + 1)
  })

  it('reconnectNow does nothing after disconnect or while connected', () => {
    const { conn } = setup()
    conn.connect()
    last().open()
    conn.reconnectNow()
    expect(MockSocket.instances).toHaveLength(1)
    conn.disconnect()
    conn.reconnectNow()
    expect(MockSocket.instances).toHaveLength(1)
  })
})

describe('webSocketUrl', () => {
  it('derives ws/wss from the API URL', () => {
    expect(webSocketUrl('https://api.example.com')).toBe('wss://api.example.com/ws')
    expect(webSocketUrl('http://192.168.1.5:8080/')).toBe('ws://192.168.1.5:8080/ws')
  })
})
