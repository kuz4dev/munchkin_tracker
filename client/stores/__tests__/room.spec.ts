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
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior' },
        ],
      })

      expect(store.allPlayers).toHaveLength(2)
      // When playerId is empty, it gets set to the last player's id
      expect(store.playerId).toBe('p2')
    })

    it('room_state clears previous players', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
        ],
      })

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        players: [
          { id: 'p3', name: 'Charlie', level: 2, gearBonus: 1, gender: 'male', race: 'dwarf', class: 'thief' },
        ],
      })

      expect(store.allPlayers).toHaveLength(1)
      expect(store.allPlayers[0]!.name).toBe('Charlie')
    })

    it('does not overwrite playerId if already set', () => {
      const store = useRoomStore()
      store.playerId = 'p1'
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior' },
        ],
      })

      expect(store.playerId).toBe('p1')
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
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior' },
        ],
      })

      handler({ type: 'player_left', playerId: 'p1' })

      expect(store.allPlayers).toHaveLength(1)
      expect(store.allPlayers[0]!.name).toBe('Bob')
    })

    it('handles player_updated message', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
        ],
      })

      handler({
        type: 'player_updated',
        player: { id: 'p1', name: 'Alice', level: 5, gearBonus: 3, gender: 'female', race: 'elf', class: 'wizard' },
      })

      expect(store.allPlayers[0]!.level).toBe(5)
      expect(store.allPlayers[0]!.gearBonus).toBe(3)
    })

    it('handles error message', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      handler({ type: 'error', message: 'Test error' })

      expect(consoleSpy).toHaveBeenCalledWith('Server error:', 'Test error')
      consoleSpy.mockRestore()
    })
  })

  describe('computed properties', () => {
    it('currentPlayer returns the player with matching playerId', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      store.playerId = 'p1'
      handler({
        type: 'room_state',
        roomCode: 'ABC123',
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

      store.playerId = 'p1'
      handler({
        type: 'room_state',
        roomCode: 'ABC123',
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

      store.playerId = 'p1'
      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
        ],
      })

      store.updateStats({ level: 5 })

      expect(store.currentPlayer?.level).toBe(5)
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

      store.playerId = 'p1'
      store.roomCode = 'ABC123'
      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard' },
        ],
      })

      store.leaveRoom()

      expect(store.roomCode).toBe('')
      expect(store.playerId).toBe('')
      expect(store.allPlayers).toHaveLength(0)
    })
  })
})
