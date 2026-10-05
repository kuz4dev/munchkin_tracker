import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useRoomStore } from '../room'
import type { ServerMessage } from '@/types'

vi.mock('@/services/roomApi', () => ({
  createRoom: vi.fn(),
}))

const mockWs = {
  status: ref<'connecting' | 'connected' | 'disconnected'>('disconnected'),
  connect: vi.fn(),
  disconnect: vi.fn(),
  send: vi.fn(),
  onMessage: vi.fn(),
}

vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: () => mockWs,
}))

import { createRoom as apiCreateRoom } from '@/services/roomApi'

function getMessageHandler(): (msg: ServerMessage) => void {
  // The room store calls connection.onMessage(handleMessage)
  // connection store calls ws.onMessage(handler)
  // So the handler is passed to mockWs.onMessage
  // But the connection store wraps it. Let's get it from the connection store's onMessage.
  // Actually, room store calls connection.onMessage which calls ws.onMessage.
  // So the last call to mockWs.onMessage has the handler.
  const calls = mockWs.onMessage.mock.calls
  return calls[calls.length - 1]![0]
}

describe('useRoomStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockWs.status.value = 'disconnected'
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('has empty initial state', () => {
      const store = useRoomStore()
      expect(store.roomCode).toBe('')
      expect(store.playerId).toBe('')
      expect(store.playerName).toBe('')
      expect(store.allPlayers).toEqual([])
      expect(store.currentPlayer).toBeUndefined()
      expect(store.otherPlayers).toEqual([])
    })
  })

  describe('handleMessage', () => {
    it('handles room_state message', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior' },
        ],
      })

      expect(store.allPlayers).toHaveLength(2)
      expect(store.playerId).toBe('p1')
      expect(store.sessionId).toBe('sess-1')
    })

    it('room_state clears previous players', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
        ],
      })

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p3', name: 'Charlie', level: 2, gearBonus: 1, gender: 'male', race: 'dwarf', class: 'thief' },
        ],
      })

      expect(store.allPlayers).toHaveLength(1)
      expect(store.allPlayers[0]!.name).toBe('Charlie')
    })

    it('takes own identity from the server, not from player order', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      // We are p1 even though p2 is last in the list
      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior' },
        ],
      })

      expect(store.currentPlayer?.name).toBe('Alice')
    })

    it('updates playerId after reconnect (server assigns a new ID)', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()
      const alice = { name: 'Alice', level: 4, gearBonus: 0, gender: 'female' as const, race: 'elf' as const, class: 'wizard' as const }

      handler({ type: 'room_state', roomCode: 'ABC123', playerId: 'p1', sessionId: 'sess-1', players: [{ id: 'p1', ...alice }] })
      handler({ type: 'room_state', roomCode: 'ABC123', playerId: 'p1-new', sessionId: 'sess-1', players: [{ id: 'p1-new', ...alice }] })

      expect(store.playerId).toBe('p1-new')
      expect(store.currentPlayer?.level).toBe(4)
    })

    it('handles player_joined message', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      const player = { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female' as const, race: 'elf' as const, class: 'wizard' as const }
      handler({ type: 'player_joined', player })

      expect(store.allPlayers).toHaveLength(1)
      expect(store.allPlayers[0]).toEqual(player)
    })

    it('handles player_left message', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior' },
        ],
      })

      handler({ type: 'player_left', playerId: 'p1' })

      expect(store.allPlayers).toHaveLength(1)
      expect(store.allPlayers[0]!.name).toBe('Bob')
    })

    it('handles player_updated message for other players', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
          { id: 'p2', name: 'Bob', level: 1, gearBonus: 0, gender: 'male', race: 'human', class: 'none' },
        ],
      })

      // p1 is the current player, so update the other one
      handler({
        type: 'player_updated',
        player: { id: 'p2', name: 'Bob', level: 5, gearBonus: 3, gender: 'male', race: 'human', class: 'none' },
      })

      const bob = store.players.get('p2')
      expect(bob!.level).toBe(5)
      expect(bob!.gearBonus).toBe(3)
    })

    it('ignores player_updated for own player (optimistic update)', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 3, gearBonus: 2, gender: 'female', race: 'elf', class: 'wizard' },
        ],
      })

      // p1 is current player, server update should be ignored
      handler({
        type: 'player_updated',
        player: { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
      })

      const alice = store.players.get('p1')
      expect(alice!.level).toBe(3)
      expect(alice!.gearBonus).toBe(2)
    })

    it('handles error message', () => {
      useRoomStore()
      const handler = getMessageHandler()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      handler({ type: 'error', message: 'Test error' })

      expect(consoleSpy).toHaveBeenCalledWith('Server error:', 'Test error')
      consoleSpy.mockRestore()
    })

    it('room not found: clears session and leaves room with a notice', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      localStorage.setItem('munchkin_session', JSON.stringify({ roomCode: 'ABC123', playerName: 'A', sessionId: 's' }))
      store.roomCode = 'ABC123'

      handler({ type: 'error', message: 'room not found' })

      expect(store.roomCode).toBe('')
      expect(store.notice).not.toBe('')
      expect(localStorage.getItem('munchkin_session')).toBeNull()
      expect(mockWs.disconnect).toHaveBeenCalled()
    })

    it('session replaced: leaves room but keeps stored session for the other tab', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      localStorage.setItem('munchkin_session', JSON.stringify({ roomCode: 'ABC123', playerName: 'A', sessionId: 's' }))
      store.roomCode = 'ABC123'

      handler({ type: 'error', message: 'session replaced' })

      expect(store.roomCode).toBe('')
      expect(store.notice).not.toBe('')
      expect(localStorage.getItem('munchkin_session')).not.toBeNull()
      expect(mockWs.disconnect).toHaveBeenCalled()
    })
  })

  describe('computed properties', () => {
    it('currentPlayer returns the player with matching playerId', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior' },
        ],
      })

      expect(store.currentPlayer?.name).toBe('Alice')
    })

    it('otherPlayers excludes currentPlayer', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior' },
        ],
      })

      expect(store.otherPlayers).toHaveLength(1)
      expect(store.otherPlayers[0]!.name).toBe('Bob')
    })
  })

  describe('createRoom', () => {
    it('calls API, sets state, and returns room code', async () => {
      vi.mocked(apiCreateRoom).mockResolvedValue({ code: 'NEW123', playerCount: 0 })
      // Pre-set connected so waitForConnection resolves
      mockWs.status.value = 'connected'

      const store = useRoomStore()
      const code = await store.createRoom('Alice')

      expect(apiCreateRoom).toHaveBeenCalled()
      expect(code).toBe('NEW123')
      expect(store.roomCode).toBe('NEW123')
      expect(store.playerName).toBe('Alice')
    })
  })

  describe('joinRoom', () => {
    it('sets state', () => {
      const store = useRoomStore()
      store.joinRoom('JOIN456', 'Bob')

      expect(store.roomCode).toBe('JOIN456')
      expect(store.playerName).toBe('Bob')
    })
  })

  describe('updateStats', () => {
    it('updates player optimistically and sends via connection', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
        ],
      })

      store.updateStats({ level: 5 })

      expect(store.currentPlayer?.level).toBe(5)
      // Only editable stats are sent — never id/name
      expect(mockWs.send).toHaveBeenCalledWith({
        type: 'update_stats',
        player: { level: 5, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
      })
    })

    it('does nothing if no current player', () => {
      const store = useRoomStore()
      store.updateStats({ level: 5 })

      expect(store.allPlayers).toHaveLength(0)
    })
  })

  describe('leaveRoom', () => {
    it('clears all state', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      store.roomCode = 'ABC123'
      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
        ],
      })

      store.leaveRoom()

      expect(store.roomCode).toBe('')
      expect(store.playerId).toBe('')
      expect(store.allPlayers).toHaveLength(0)
    })

    it('clears changelog on leave', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
        ],
        changeLog: [
          { timestamp: 1000, playerName: 'Alice', eventType: 'join' },
        ],
      })

      expect(store.changelog).toHaveLength(1)
      store.leaveRoom()
      expect(store.changelog).toHaveLength(0)
    })
  })

  describe('changelog', () => {
    it('loads changelog from room_state', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
        ],
        changeLog: [
          { timestamp: 1000, playerName: 'Alice', eventType: 'join' },
          { timestamp: 2000, playerName: 'Alice', eventType: 'stat_change', field: 'level', oldValue: '1', newValue: '3' },
        ],
      })

      expect(store.changelog).toHaveLength(2)
      expect(store.changelog[0]!.eventType).toBe('join')
      expect(store.changelog[1]!.field).toBe('level')
    })

    it('handles room_state without changeLog (backward compat)', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
        ],
      })

      expect(store.changelog).toHaveLength(0)
    })

    it('handles changelog_entry message', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'changelog_entry',
        changeLogEntry: { timestamp: 1000, playerName: 'Alice', eventType: 'join' },
      })

      expect(store.changelog).toHaveLength(1)
      expect(store.changelog[0]!.playerName).toBe('Alice')
    })

    it('caps changelog at 100 entries', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      // Load 99 entries via room_state
      const entries = Array.from({ length: 99 }, (_, i) => ({
        timestamp: i,
        playerName: 'Alice',
        eventType: 'join' as const,
      }))

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
        ],
        changeLog: entries,
      })

      // Add 2 more via changelog_entry to exceed 100
      handler({
        type: 'changelog_entry',
        changeLogEntry: { timestamp: 100, playerName: 'Bob', eventType: 'join' },
      })
      handler({
        type: 'changelog_entry',
        changeLogEntry: { timestamp: 101, playerName: 'Charlie', eventType: 'join' },
      })

      expect(store.changelog).toHaveLength(100)
      // Oldest entry should be trimmed
      expect(store.changelog[0]!.timestamp).toBe(1)
    })
  })
})
