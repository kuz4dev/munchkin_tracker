import { vi } from 'vitest'
import type { Api } from '../api'
import type { ConnectionStatus } from '../connection'
import type { ClientMessage, Player, ServerMessage } from '../protocol'

/** A controllable in-memory Connection. */
export function fakeConnection() {
  let status: ConnectionStatus = 'disconnected'
  const messageHandlers = new Set<(m: ServerMessage) => void>()
  const statusHandlers = new Set<(s: ConnectionStatus) => void>()
  const sent: ClientMessage[] = []
  const conn = {
    get status() {
      return status
    },
    connect: vi.fn(() => conn.setStatus('connected')),
    disconnect: vi.fn(() => conn.setStatus('disconnected')),
    reconnectNow: vi.fn(),
    send: vi.fn((m: ClientMessage) => {
      if (status === 'connected') sent.push(m)
    }),
    onMessage(h: (m: ServerMessage) => void) {
      messageHandlers.add(h)
      return () => messageHandlers.delete(h)
    },
    onStatus(h: (s: ConnectionStatus) => void) {
      statusHandlers.add(h)
      return () => statusHandlers.delete(h)
    },
    // test helpers
    sent,
    setStatus(s: ConnectionStatus) {
      status = s
      for (const h of statusHandlers) h(s)
    },
    emit(m: ServerMessage) {
      for (const h of messageHandlers) h(m)
    },
  }
  return conn
}

export function fakeApi(): { [K in keyof Api]: ReturnType<typeof vi.fn> } & Api {
  return {
    createRoom: vi.fn(async () => ({ code: 'ABC234', playerCount: 0 })),
    getRoomInfo: vi.fn(async (code: string) => ({ code, playerCount: 1 })),
    getRoomEvents: vi.fn(async () => ({ events: [], hasMore: false })),
  }
}

export function player(id: string, name: string, overrides: Partial<Player> = {}): Player {
  return { id, name, level: 1, gearBonus: 0, gender: 'male', race: 'human', class: 'none', connected: true, ...overrides }
}
