import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useRoomStore } from '../room'
import type { ServerMessage } from '@/types'

vi.mock('@/services/roomApi', () => ({
  createRoom: vi.fn(),
  getRoomEvents: vi.fn(),
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

import { createRoom as apiCreateRoom, getRoomEvents } from '@/services/roomApi'

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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior', connected: true },
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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
        ],
      })

      handler({
        type: 'room_state',
        roomCode: 'ABC123',
        playerId: 'p1',
        sessionId: 'sess-1',
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p3', name: 'Charlie', level: 2, gearBonus: 1, gender: 'male', race: 'dwarf', class: 'thief', connected: true },
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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior', connected: true },
        ],
      })

      expect(store.currentPlayer?.name).toBe('Alice')
    })

    it('updates playerId after reconnect (server assigns a new ID)', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()
      const alice = { name: 'Alice', level: 4, gearBonus: 0, gender: 'female' as const, race: 'elf' as const, class: 'wizard' as const, connected: true }

      handler({ type: 'room_state', roomCode: 'ABC123', playerId: 'p1', sessionId: 'sess-1', status: 'active', createdAt: 0, players: [{ id: 'p1', ...alice }] })
      handler({ type: 'room_state', roomCode: 'ABC123', playerId: 'p1-new', sessionId: 'sess-1', status: 'active', createdAt: 0, players: [{ id: 'p1-new', ...alice }] })

      expect(store.playerId).toBe('p1-new')
      expect(store.currentPlayer?.level).toBe(4)
    })

    it('handles player_joined message', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      const player = { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female' as const, race: 'elf' as const, class: 'wizard' as const, connected: true }
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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior', connected: true },
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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
          { id: 'p2', name: 'Bob', level: 1, gearBonus: 0, gender: 'male', race: 'human', class: 'none', connected: true },
        ],
      })

      // p1 is the current player, so update the other one
      handler({
        type: 'player_updated',
        player: { id: 'p2', name: 'Bob', level: 5, gearBonus: 3, gender: 'male', race: 'human', class: 'none', connected: true },
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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 3, gearBonus: 2, gender: 'female', race: 'elf', class: 'wizard', connected: true },
        ],
      })

      // p1 is current player, server update should be ignored
      handler({
        type: 'player_updated',
        player: { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior', connected: true },
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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
          { id: 'p2', name: 'Bob', level: 3, gearBonus: 2, gender: 'male', race: 'human', class: 'warrior', connected: true },
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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
        ],
        changeLog: [
          { seq: 1, timestamp: 1000, playerId: 'p', playerName: 'Alice', eventType: 'join' },
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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
        ],
        changeLog: [
          { seq: 1, timestamp: 1000, playerId: 'p', playerName: 'Alice', eventType: 'join' },
          { seq: 1, timestamp: 2000, playerId: 'p', playerName: 'Alice', eventType: 'stat_change', field: 'level', oldValue: '1', newValue: '3' },
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
        status: 'active',
        createdAt: 0,
        players: [
          { id: 'p1', name: 'Alice', level: 1, gearBonus: 0, gender: 'female', race: 'elf', class: 'wizard', connected: true },
        ],
      })

      expect(store.changelog).toHaveLength(0)
    })

    it('handles changelog_entry message', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()

      handler({
        type: 'changelog_entry',
        changeLogEntry: { seq: 1, timestamp: 1000, playerId: 'p', playerName: 'Alice', eventType: 'join' },
      })

      expect(store.changelog).toHaveLength(1)
      expect(store.changelog[0]!.playerName).toBe('Alice')
    })

    it('caps changelog at 1000 entries', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()
      const entry = (seq: number) => ({ seq, timestamp: seq, playerId: 'p1', playerName: 'Alice', eventType: 'join' as const })

      store.changelog = Array.from({ length: 999 }, (_, i) => entry(i + 1))
      handler({ type: 'changelog_entry', changeLogEntry: entry(1000) })
      handler({ type: 'changelog_entry', changeLogEntry: entry(1001) })

      expect(store.changelog).toHaveLength(1000)
      // Oldest entry is trimmed
      expect(store.changelog[0]!.seq).toBe(2)
    })
  })

  describe('history', () => {
    const entry = (seq: number) => ({ seq, timestamp: seq, playerId: 'p1', playerName: 'Alice', eventType: 'join' as const })

    it('prepends older events without duplicates', async () => {
      const store = useRoomStore()
      store.roomCode = 'ABC123'
      store.changelog = [entry(5), entry(6)]
      // Overlapping page (e.g. a live event arrived meanwhile)
      vi.mocked(getRoomEvents).mockResolvedValue({ events: [entry(3), entry(4), entry(5)], hasMore: true })

      expect(store.hasOlder).toBe(true)
      await store.loadOlder()

      expect(getRoomEvents).toHaveBeenCalledWith('ABC123', 5)
      expect(store.changelog.map((e) => e.seq)).toEqual([3, 4, 5, 6])
      expect(store.loadingOlder).toBe(false)
    })

    it('does nothing when the first event is already loaded', async () => {
      const store = useRoomStore()
      store.changelog = [entry(1), entry(2)]
      expect(store.hasOlder).toBe(false)
      await store.loadOlder()
      expect(getRoomEvents).not.toHaveBeenCalled()
    })

    it('live entries do not evict loaded history below 1000', () => {
      const store = useRoomStore()
      store.changelog = Array.from({ length: 300 }, (_, i) => entry(i + 1))
      getMessageHandler()({ type: 'changelog_entry', changeLogEntry: entry(301) })
      expect(store.changelog).toHaveLength(301)
      expect(store.changelog[0]!.seq).toBe(1)
    })
  })

  describe('game lifecycle', () => {
    const alice = { id: 'p1', name: 'Alice', level: 10, gearBonus: 0, gender: 'female' as const, race: 'elf' as const, class: 'wizard' as const, connected: true }

    it('reads status and timestamps from room_state', () => {
      const store = useRoomStore()
      getMessageHandler()({
        type: 'room_state', roomCode: 'ABC123', playerId: 'p1', sessionId: 's',
        status: 'finished', winnerId: 'p1', createdAt: 1000, finishedAt: 5000, players: [alice],
      })

      expect(store.isFinished).toBe(true)
      expect(store.winner?.name).toBe('Alice')
      expect(store.createdAt).toBe(1000)
      expect(store.finishedAt).toBe(5000)
    })

    it('handles game_finished', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()
      handler({ type: 'room_state', roomCode: 'ABC123', playerId: 'p1', sessionId: 's', status: 'active', createdAt: 1000, players: [alice] })
      expect(store.isFinished).toBe(false)

      handler({ type: 'game_finished', status: 'finished', winnerId: 'p1', finishedAt: 9000 })

      expect(store.isFinished).toBe(true)
      expect(store.winnerId).toBe('p1')
      expect(store.finishedAt).toBe(9000)
    })

    it('finishGame sends the winner, or none', () => {
      const store = useRoomStore()
      store.finishGame('p1')
      expect(mockWs.send).toHaveBeenLastCalledWith({ type: 'finish_game', winnerId: 'p1' })
      store.finishGame()
      expect(mockWs.send).toHaveBeenLastCalledWith({ type: 'finish_game', winnerId: undefined })
    })

    it('joining a finished game as a new player shows a notice', () => {
      const store = useRoomStore()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      store.roomCode = 'ABC123' // joining, no playerId yet

      getMessageHandler()({ type: 'error', message: 'game finished' })

      expect(store.roomCode).toBe('')
      expect(store.notice).toBe('Эта игра уже завершена')
    })

    it('retries joining when the server is temporarily unavailable', () => {
      vi.useFakeTimers()
      try {
        const store = useRoomStore()
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mockWs.status.value = 'connected'
        store.roomCode = 'ABC123'
        store.playerName = 'Alice'

        getMessageHandler()({ type: 'error', message: 'temporarily unavailable' })
        expect(mockWs.send).not.toHaveBeenCalled()

        vi.advanceTimersByTime(2000)
        expect(mockWs.send).toHaveBeenCalledWith({ type: 'join_room', roomCode: 'ABC123', playerName: 'Alice', sessionId: undefined })
        expect(store.roomCode).toBe('ABC123')
      } finally {
        vi.useRealTimers()
      }
    })

    it('ignores "game finished" errors while in the room', () => {
      const store = useRoomStore()
      const handler = getMessageHandler()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      handler({ type: 'room_state', roomCode: 'ABC123', playerId: 'p1', sessionId: 's', status: 'active', createdAt: 0, players: [alice] })

      handler({ type: 'error', message: 'game finished' })

      expect(store.roomCode).toBe('ABC123')
    })

    it('leaveRoom resets the lifecycle state', () => {
      const store = useRoomStore()
      getMessageHandler()({
        type: 'room_state', roomCode: 'ABC123', playerId: 'p1', sessionId: 's',
        status: 'finished', winnerId: 'p1', createdAt: 1000, finishedAt: 5000, players: [alice],
      })
      store.leaveRoom()
      expect(store.isFinished).toBe(false)
      expect(store.winnerId).toBe('')
    })
  })
})
