import { createStore, type StoreApi } from 'zustand/vanilla'
import { ApiError, type Api } from './api'
import type { Connection, ConnectionStatus } from './connection'
import { normalizeRoomCode } from './game'
import { ServerErrors, type ChangeLogEntry, type GameStatus, type Player, type PlayerStats, type ServerMessage } from './protocol'
import type { SessionStorage } from './session'

/** Max changelog entries kept on the client (live + loaded history) */
export const MAX_CHANGELOG = 1000
export const JOIN_RETRY_DELAY = 2000

export const Notices = {
  roomNotFound: 'Комната не найдена или уже закрыта',
  sessionReplaced: 'Вы подключились к комнате с другой вкладки или устройства',
  gameFinished: 'Эта игра уже завершена',
  roomFull: 'В комнате уже максимум игроков',
} as const

export interface GameState {
  connectionStatus: ConnectionStatus
  roomCode: string
  playerId: string
  playerName: string
  sessionId: string
  /** Keyed by player ID, in join order */
  players: Record<string, Player>
  changelog: ChangeLogEntry[]
  /** User-facing reason the room was closed, shown on the home screen */
  notice: string
  status: GameStatus
  winnerId: string
  hostId: string
  /** Unix ms */
  createdAt: number
  finishedAt: number
  loadingOlder: boolean
}

export type ResumeResult = 'resumed' | 'no_session' | 'not_found' | 'error'

export interface GameActions {
  /** Creates a room and joins it. Returns the room code. */
  createRoom(name: string): Promise<string>
  /** Checks the room exists, then joins it. Throws ApiError (notFound) otherwise. */
  joinRoom(code: string, name: string): Promise<void>
  /** Gets back into the stored game for this room code after an app restart. */
  resumeSession(code: string): Promise<ResumeResult>
  updateStats(stats: Partial<PlayerStats>): void
  /** Ends the game for everyone (host only). Omit winnerId for no winner. */
  finishGame(winnerId?: string): void
  /** Prepends the previous page of history to the changelog. */
  loadOlder(): Promise<void>
  leaveRoom(): void
  clearNotice(): void
}

export type GameStore = StoreApi<GameState & GameActions>

export interface GameStoreDeps {
  connection: Connection
  api: Api
  session: SessionStorage
}

const emptyRoom = {
  roomCode: '',
  playerId: '',
  sessionId: '',
  players: {},
  changelog: [],
  status: 'active',
  winnerId: '',
  hostId: '',
  createdAt: 0,
  finishedAt: 0,
  loadingOlder: false,
} satisfies Partial<GameState>

export function createGameStore({ connection, api, session }: GameStoreDeps): GameStore {
  let joinedOnce = false // the first join is sent by connectToRoom, later ones on reconnect
  let joinRetry: ReturnType<typeof setTimeout> | null = null
  // A resume already in progress, so repeated calls (e.g. a component
  // mounting twice) don't send a second join on the same connection.
  let resuming: { code: string; result: Promise<ResumeResult> } | null = null

  const store = createStore<GameState & GameActions>()((set, get) => {
    function sendJoin() {
      const { roomCode, playerName, sessionId } = get()
      connection.send({ type: 'join_room', roomCode, playerName, sessionId: sessionId || undefined })
    }

    function resetRoom() {
      if (joinRetry) {
        clearTimeout(joinRetry)
        joinRetry = null
      }
      joinedOnce = false
      connection.disconnect()
      set(emptyRoom)
    }

    function closeWithNotice(notice: string, clearStoredSession: boolean) {
      if (clearStoredSession) void session.clear()
      resetRoom()
      set({ notice })
    }

    function scheduleJoinRetry() {
      if (joinRetry) return
      joinRetry = setTimeout(() => {
        joinRetry = null
        const { roomCode, playerName, playerId } = get()
        if (roomCode && playerName && !playerId && connection.status === 'connected') sendJoin()
      }, JOIN_RETRY_DELAY)
    }

    function handleError(message: string) {
      console.error('Server error:', message)
      const { roomCode, playerId } = get()
      const joining = !!roomCode && !playerId
      if (message === ServerErrors.unavailable && joining) {
        // The server couldn't load the game (database hiccup): try again
        scheduleJoinRetry()
      } else if (message === ServerErrors.roomFull && joining) {
        closeWithNotice(Notices.roomFull, true)
      } else if (message === ServerErrors.gameFinished && joining) {
        closeWithNotice(Notices.gameFinished, true)
      } else if (message === ServerErrors.roomNotFound && roomCode) {
        closeWithNotice(Notices.roomNotFound, true)
      } else if (message === ServerErrors.sessionReplaced) {
        // Another tab/device took over this seat. Keep the stored session (it
        // belongs to the other one now) and don't reconnect, or the two would
        // keep stealing it from each other.
        closeWithNotice(Notices.sessionReplaced, false)
      }
    }

    function handleMessage(msg: ServerMessage) {
      switch (msg.type) {
        case 'room_state': {
          const players: Record<string, Player> = {}
          for (const p of msg.players) players[p.id] = p
          set({
            players,
            changelog: msg.changeLog ?? [],
            playerId: msg.playerId,
            sessionId: msg.sessionId,
            roomCode: msg.roomCode,
            status: msg.status,
            winnerId: msg.winnerId ?? '',
            hostId: msg.hostId ?? '',
            createdAt: msg.createdAt,
            finishedAt: msg.finishedAt ?? 0,
          })
          const { roomCode, playerName, sessionId } = get()
          if (roomCode && playerName && sessionId) void session.save({ roomCode, playerName, sessionId })
          break
        }
        case 'player_joined':
          set((s) => ({ players: { ...s.players, [msg.player.id]: msg.player } }))
          break
        case 'player_left':
          set((s) => {
            const { [msg.playerId]: _, ...rest } = s.players
            return { players: rest }
          })
          break
        case 'player_updated':
          // Our own changes are applied optimistically; the echo is ignored
          if (msg.player.id !== get().playerId) {
            set((s) => ({ players: { ...s.players, [msg.player.id]: msg.player } }))
          }
          break
        case 'changelog_entry':
          set((s) => {
            const changelog = [...s.changelog, msg.changeLogEntry]
            return { changelog: changelog.length > MAX_CHANGELOG ? changelog.slice(-MAX_CHANGELOG) : changelog }
          })
          break
        case 'host_changed':
          set({ hostId: msg.hostId ?? '' })
          break
        case 'game_finished':
          set({ status: msg.status, winnerId: msg.winnerId ?? '', finishedAt: msg.finishedAt })
          break
        case 'error':
          handleError(msg.message)
          break
      }
    }

    connection.onMessage(handleMessage)

    // Resume the seat after any reconnect (but not on the very first connect,
    // whose join is sent by connectToRoom).
    let lastStatus = connection.status
    connection.onStatus((status) => {
      set({ connectionStatus: status })
      if (status === 'connected' && lastStatus !== 'connected' && joinedOnce && get().roomCode && get().playerName) {
        sendJoin()
      }
      lastStatus = status
    })

    function waitForConnection(): Promise<void> {
      if (connection.status === 'connected') return Promise.resolve()
      return new Promise((resolve) => {
        const off = connection.onStatus((s) => {
          if (s === 'connected') {
            off()
            resolve()
          }
        })
      })
    }

    async function connectToRoom() {
      connection.connect()
      await waitForConnection()
      sendJoin()
      joinedOnce = true
    }

    async function resume(code: string): Promise<ResumeResult> {
      const saved = await session.load()
      if (!saved || saved.roomCode !== code) return 'no_session'
      try {
        await api.getRoomInfo(code)
      } catch (e) {
        if (e instanceof ApiError && e.notFound) {
          void session.clear()
          set({ notice: Notices.roomNotFound })
          return 'not_found'
        }
        // Server unreachable for now: keep the session to try again later
        return 'error'
      }
      set({ notice: '', playerName: saved.playerName, roomCode: code, sessionId: saved.sessionId })
      await connectToRoom()
      return 'resumed'
    }

    return {
      connectionStatus: connection.status,
      playerName: '',
      notice: '',
      ...emptyRoom,

      async createRoom(name) {
        const { code } = await api.createRoom()
        set({ notice: '', playerName: name, roomCode: code, sessionId: '' })
        await connectToRoom()
        return code
      },

      async joinRoom(rawCode, name) {
        const code = normalizeRoomCode(rawCode)
        await api.getRoomInfo(code)
        set({ notice: '', playerName: name, roomCode: code, sessionId: '' })
        await connectToRoom()
      },

      resumeSession(rawCode) {
        const code = normalizeRoomCode(rawCode)
        if (resuming?.code === code) return resuming.result
        const result = resume(code).finally(() => {
          if (resuming?.result === result) resuming = null
        })
        resuming = { code, result }
        return result
      },


      updateStats(stats) {
        const { players, playerId } = get()
        const current = players[playerId]
        if (!current) return
        const updated: Player = { ...current, ...stats }
        set({ players: { ...players, [playerId]: updated } })
        connection.send({
          type: 'update_stats',
          player: {
            level: updated.level,
            gearBonus: updated.gearBonus,
            gender: updated.gender,
            race: updated.race,
            class: updated.class,
          },
        })
      },

      finishGame(winnerId) {
        connection.send({ type: 'finish_game', winnerId: winnerId || undefined })
      },

      async loadOlder() {
        const { changelog, loadingOlder, roomCode } = get()
        const first = changelog[0]
        if (!first || first.seq <= 1 || loadingOlder) return
        set({ loadingOlder: true })
        try {
          const page = await api.getRoomEvents(roomCode, first.seq)
          set((s) => {
            // The changelog may have been replaced (reconnect) while loading
            const current = s.changelog[0]?.seq ?? Infinity
            return { changelog: [...page.events.filter((e) => e.seq < current), ...s.changelog] }
          })
        } finally {
          set({ loadingOlder: false })
        }
      },

      leaveRoom() {
        connection.send({ type: 'leave_room' })
        resetRoom()
        void session.clear()
      },

      clearNotice() {
        set({ notice: '' })
      },
    }
  })

  return store
}
