import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import type { ChangeLogEntry, RoomStateMessage } from '../protocol'
import {
  selectAllPlayers, selectConnected, selectCurrentPlayer, selectHasOlder, selectHost,
  selectIsFinished, selectIsHost, selectOtherPlayers, selectWinner,
} from '../selectors'
import { createMemorySessionStorage } from '../session'
import { createGameStore, MAX_CHANGELOG, Notices } from '../store'
import { fakeApi, fakeConnection, player } from './fakes'

function setup() {
  const connection = fakeConnection()
  const api = fakeApi()
  const session = createMemorySessionStorage()
  const store = createGameStore({ connection, api, session })
  return { connection, api, session, store, s: () => store.getState() }
}

function roomState(overrides: Partial<RoomStateMessage> = {}): RoomStateMessage {
  return {
    type: 'room_state',
    roomCode: 'ABC234',
    playerId: 'p1',
    sessionId: 'sess-1',
    status: 'active',
    hostId: 'p1',
    createdAt: 1000,
    players: [player('p1', 'Alice'), player('p2', 'Bob')],
    ...overrides,
  }
}

const entry = (seq: number, overrides: Partial<ChangeLogEntry> = {}): ChangeLogEntry => ({
  seq, timestamp: seq, playerId: 'p1', playerName: 'Alice', eventType: 'join', ...overrides,
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('joining', () => {
  it('createRoom joins the new room', async () => {
    const { connection, api, s } = setup()
    const code = await s().createRoom('Alice')

    expect(api.createRoom).toHaveBeenCalled()
    expect(code).toBe('ABC234')
    expect(connection.sent).toEqual([{ type: 'join_room', roomCode: 'ABC234', playerName: 'Alice', sessionId: undefined }])
  })

  it('joinRoom checks the room first and normalizes the code', async () => {
    const { connection, api, s } = setup()
    await s().joinRoom('  abc234 ', 'Bob')

    expect(api.getRoomInfo).toHaveBeenCalledWith('ABC234')
    expect(connection.sent[0]).toMatchObject({ type: 'join_room', roomCode: 'ABC234', playerName: 'Bob' })
  })

  it('joinRoom does not connect to a missing room', async () => {
    const { connection, api, s } = setup()
    api.getRoomInfo.mockRejectedValue(new ApiError('nope', 404))

    await expect(s().joinRoom('NOPE22', 'Bob')).rejects.toMatchObject({ notFound: true })
    expect(connection.connect).not.toHaveBeenCalled()
    expect(s().roomCode).toBe('')
  })

  it('takes identity and room from room_state and stores the session', async () => {
    const { connection, session, s } = setup()
    await s().createRoom('Alice')
    // We are p1 even though p2 is listed last
    connection.emit(roomState())

    expect(selectCurrentPlayer(s())?.name).toBe('Alice')
    expect(selectOtherPlayers(s()).map((p) => p.name)).toEqual(['Bob'])
    expect(await session.load()).toEqual({ roomCode: 'ABC234', playerName: 'Alice', sessionId: 'sess-1' })
  })

  it('rejoins with the session after a reconnect, but not on the first connect', async () => {
    const { connection, s } = setup()
    await s().createRoom('Alice')
    connection.emit(roomState())
    expect(connection.sent).toHaveLength(1)

    connection.setStatus('disconnected')
    expect(selectConnected(s())).toBe(false)
    connection.setStatus('connected')

    expect(connection.sent).toHaveLength(2)
    expect(connection.sent[1]).toEqual({ type: 'join_room', roomCode: 'ABC234', playerName: 'Alice', sessionId: 'sess-1' })
  })
})

describe('resumeSession', () => {
  it('resumes the stored game for the same code', async () => {
    const { connection, session, s } = setup()
    await session.save({ roomCode: 'ABC234', playerName: 'Alice', sessionId: 'sess-9' })

    expect(await s().resumeSession('abc234')).toBe('resumed')
    expect(connection.sent[0]).toEqual({ type: 'join_room', roomCode: 'ABC234', playerName: 'Alice', sessionId: 'sess-9' })
  })

  it('concurrent calls share one attempt (no second join on the socket)', async () => {
    const { connection, session, s } = setup()
    await session.save({ roomCode: 'ABC234', playerName: 'Alice', sessionId: 'sess-9' })

    const [a, b] = await Promise.all([s().resumeSession('ABC234'), s().resumeSession('abc234')])

    expect([a, b]).toEqual(['resumed', 'resumed'])
    expect(connection.connect).toHaveBeenCalledTimes(1)
    expect(connection.sent.filter((m) => m.type === 'join_room')).toHaveLength(1)
  })

  it('ignores a session for another room', async () => {
    const { connection, session, s } = setup()
    await session.save({ roomCode: 'ZZZ999', playerName: 'Alice', sessionId: 's' })
    expect(await s().resumeSession('ABC234')).toBe('no_session')
    expect(connection.connect).not.toHaveBeenCalled()
  })

  it('forgets the session when the room is gone', async () => {
    const { api, session, s } = setup()
    await session.save({ roomCode: 'ABC234', playerName: 'Alice', sessionId: 's' })
    api.getRoomInfo.mockRejectedValue(new ApiError('gone', 404))

    expect(await s().resumeSession('ABC234')).toBe('not_found')
    expect(await session.load()).toBeNull()
    expect(s().notice).toBe(Notices.roomNotFound)
  })

  it('keeps the session when the server is unreachable', async () => {
    const { api, session, s } = setup()
    await session.save({ roomCode: 'ABC234', playerName: 'Alice', sessionId: 's' })
    api.getRoomInfo.mockRejectedValue(new ApiError('down', 0))

    expect(await s().resumeSession('ABC234')).toBe('error')
    expect(await session.load()).not.toBeNull()
  })
})

describe('messages', () => {
  it('player_joined / player_left / player_updated', async () => {
    const { connection, s } = setup()
    await s().createRoom('Alice')
    connection.emit(roomState({ players: [player('p1', 'Alice')] }))

    connection.emit({ type: 'player_joined', player: player('p3', 'Carol') })
    connection.emit({ type: 'player_updated', player: player('p3', 'Carol', { level: 5, connected: false }) })
    expect(s().players.p3).toMatchObject({ level: 5, connected: false })

    connection.emit({ type: 'player_left', playerId: 'p3' })
    expect(selectAllPlayers(s()).map((p) => p.id)).toEqual(['p1'])
  })

  it('ignores the echo of our own update (optimistic)', async () => {
    const { connection, s } = setup()
    await s().createRoom('Alice')
    connection.emit(roomState())
    s().updateStats({ level: 3 })

    connection.emit({ type: 'player_updated', player: player('p1', 'Alice', { level: 2 }) })
    expect(selectCurrentPlayer(s())?.level).toBe(3)
  })

  it('updateStats sends only editable stats', async () => {
    const { connection, s } = setup()
    await s().createRoom('Alice')
    connection.emit(roomState())
    s().updateStats({ level: 5 })

    expect(connection.sent.at(-1)).toEqual({
      type: 'update_stats',
      player: { level: 5, gearBonus: 0, gender: 'male', race: 'human', class: 'none' },
    })
  })

  it('caps the changelog', async () => {
    const { connection, s } = setup()
    connection.emit(roomState({ changeLog: Array.from({ length: MAX_CHANGELOG }, (_, i) => entry(i + 1)) }))
    connection.emit({ type: 'changelog_entry', changeLogEntry: entry(MAX_CHANGELOG + 1) })

    expect(s().changelog).toHaveLength(MAX_CHANGELOG)
    expect(s().changelog[0]!.seq).toBe(2)
  })

  it('tracks host and game lifecycle', async () => {
    const { connection, s } = setup()
    connection.emit(roomState({ hostId: 'p2' }))
    expect(selectIsHost(s())).toBe(false)
    expect(selectHost(s())?.name).toBe('Bob')

    connection.emit({ type: 'host_changed', hostId: 'p1' })
    expect(selectIsHost(s())).toBe(true)

    connection.emit({ type: 'game_finished', status: 'finished', winnerId: 'p2', finishedAt: 9000 })
    expect(selectIsFinished(s())).toBe(true)
    expect(selectWinner(s())?.name).toBe('Bob')
    expect(s().finishedAt).toBe(9000)
  })

  it('finishGame sends the winner, or none', async () => {
    const { connection, s } = setup()
    await s().createRoom('Alice')
    s().finishGame('p2')
    s().finishGame()
    expect(connection.sent.slice(-2)).toEqual([
      { type: 'finish_game', winnerId: 'p2' },
      { type: 'finish_game', winnerId: undefined },
    ])
  })
})

describe('server errors', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each([
    ['room not found', Notices.roomNotFound],
    ['room is full', Notices.roomFull],
    ['game finished', Notices.gameFinished],
  ])('"%s" while joining closes the room with a notice', async (message, notice) => {
    const { connection, session, s } = setup()
    await s().joinRoom('ABC234', 'Bob')
    await session.save({ roomCode: 'ABC234', playerName: 'Bob', sessionId: 's' })

    connection.emit({ type: 'error', message })

    expect(s().roomCode).toBe('')
    expect(s().notice).toBe(notice)
    expect(await session.load()).toBeNull()
    expect(connection.disconnect).toHaveBeenCalled()
  })

  it('"session replaced" keeps the stored session for the other device', async () => {
    const { connection, session, s } = setup()
    await s().createRoom('Alice')
    connection.emit(roomState())

    connection.emit({ type: 'error', message: 'session replaced' })

    expect(s().roomCode).toBe('')
    expect(s().notice).toBe(Notices.sessionReplaced)
    expect(await session.load()).not.toBeNull()
  })

  it('"game finished" while in the room is ignored', async () => {
    const { connection, s } = setup()
    await s().createRoom('Alice')
    connection.emit(roomState())
    connection.emit({ type: 'error', message: 'game finished' })
    expect(s().roomCode).toBe('ABC234')
  })

  it('retries joining when the server is temporarily unavailable', async () => {
    vi.useFakeTimers()
    const { connection, s } = setup()
    await s().joinRoom('ABC234', 'Bob')
    expect(connection.sent).toHaveLength(1)

    connection.emit({ type: 'error', message: 'temporarily unavailable' })
    vi.advanceTimersByTime(1999)
    expect(connection.sent).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(connection.sent).toHaveLength(2)
  })
})

describe('history', () => {
  it('prepends older events without duplicates', async () => {
    const { connection, api, s } = setup()
    connection.emit(roomState({ changeLog: [entry(5), entry(6)] }))
    // Overlapping page (e.g. a live event arrived meanwhile)
    api.getRoomEvents.mockResolvedValue({ events: [entry(3), entry(4), entry(5)], hasMore: true })

    expect(selectHasOlder(s())).toBe(true)
    await s().loadOlder()

    expect(api.getRoomEvents).toHaveBeenCalledWith('ABC234', 5)
    expect(s().changelog.map((e) => e.seq)).toEqual([3, 4, 5, 6])
    expect(s().loadingOlder).toBe(false)
  })

  it('does nothing when the first event is loaded', async () => {
    const { connection, api, s } = setup()
    connection.emit(roomState({ changeLog: [entry(1), entry(2)] }))
    expect(selectHasOlder(s())).toBe(false)
    await s().loadOlder()
    expect(api.getRoomEvents).not.toHaveBeenCalled()
  })

  it('resets loading state when the request fails', async () => {
    const { connection, api, s } = setup()
    connection.emit(roomState({ changeLog: [entry(10)] }))
    api.getRoomEvents.mockRejectedValue(new ApiError('down', 0))

    await expect(s().loadOlder()).rejects.toThrow()
    expect(s().loadingOlder).toBe(false)
    expect(s().changelog).toHaveLength(1)
  })
})

describe('leaving', () => {
  it('leaveRoom tells the server and clears everything', async () => {
    const { connection, session, s } = setup()
    await s().createRoom('Alice')
    connection.emit(roomState({ status: 'finished', winnerId: 'p1', changeLog: [entry(1)] }))

    s().leaveRoom()

    expect(connection.sent.at(-1)).toEqual({ type: 'leave_room' })
    expect(s()).toMatchObject({ roomCode: '', playerId: '', players: {}, changelog: [], status: 'active', winnerId: '', hostId: '' })
    expect(await session.load()).toBeNull()
  })
})
