import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { useConnectionStore } from './connection'
import { createRoom as apiCreateRoom, getRoomEvents } from '@/services/roomApi'
import { saveSession, clearSession } from '@/services/sessionStorage'
import type { ChangeLogEntry, GameStatus, Player, PlayerStats, ServerMessage } from '@/types'

/** Server error messages the client reacts to (see server/internal/room). */
const ERR_ROOM_NOT_FOUND = 'room not found'
const ERR_SESSION_REPLACED = 'session replaced'
const ERR_GAME_FINISHED = 'game finished'
const ERR_UNAVAILABLE = 'temporarily unavailable'
const ERR_ROOM_FULL = 'room is full'
const JOIN_RETRY_DELAY = 2000

/** Max changelog entries kept on the client (live + loaded history) */
const MAX_CHANGELOG = 1000

export const useRoomStore = defineStore('room', () => {
  const connection = useConnectionStore()

  const roomCode = ref('')
  const playerId = ref('')
  const playerName = ref('')
  const sessionId = ref('')
  const players = reactive(new Map<string, Player>())
  const changelog = ref<ChangeLogEntry[]>([])
  /** User-facing reason the room was closed, shown on the home page */
  const notice = ref('')
  const status = ref<GameStatus>('active')
  const winnerId = ref('')
  const hostId = ref('')
  const createdAt = ref(0)
  const finishedAt = ref(0)
  const loadingOlder = ref(false)
  let joinedOnce = false // prevents watcher from double-sending join_room
  let joinRetry: ReturnType<typeof setTimeout> | null = null

  const connected = computed(() => connection.isConnected)
  const currentPlayer = computed(() => players.get(playerId.value))
  const otherPlayers = computed(() => {
    const result: Player[] = []
    for (const [id, player] of players) {
      if (id !== playerId.value) {
        result.push(player)
      }
    }
    return result
  })
  const allPlayers = computed(() => Array.from(players.values()))
  const isFinished = computed(() => status.value === 'finished')
  /** Whether events older than the loaded ones exist (seq starts at 1) */
  const hasOlder = computed(() => (changelog.value[0]?.seq ?? 1) > 1)
  const winner = computed(() => (winnerId.value ? players.get(winnerId.value) : undefined))
  const host = computed(() => (hostId.value ? players.get(hostId.value) : undefined))
  /** Only the host can finish the game */
  const isHost = computed(() => !!playerId.value && hostId.value === playerId.value)

  connection.onMessage(handleMessage)

  // Auto-rejoin after WebSocket reconnect (not the initial connect)
  watch(() => connection.status, (newStatus, oldStatus) => {
    if (newStatus === 'connected' && oldStatus !== 'connected' && joinedOnce && roomCode.value && playerName.value) {
      connection.send({
        type: 'join_room',
        roomCode: roomCode.value,
        playerName: playerName.value,
        sessionId: sessionId.value || undefined,
      })
    }
  })

  function handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'room_state': {
        players.clear()
        for (const p of msg.players) {
          players.set(p.id, p)
        }
        changelog.value = msg.changeLog ?? []
        // The server tells us who we are. Our ID changes on every reconnect.
        playerId.value = msg.playerId
        sessionId.value = msg.sessionId
        roomCode.value = msg.roomCode
        status.value = msg.status
        winnerId.value = msg.winnerId ?? ''
        hostId.value = msg.hostId ?? ''
        createdAt.value = msg.createdAt
        finishedAt.value = msg.finishedAt ?? 0
        if (roomCode.value && playerName.value && sessionId.value) {
          saveSession({
            roomCode: roomCode.value,
            playerName: playerName.value,
            sessionId: sessionId.value,
          })
        }
        break
      }

      case 'player_joined':
        players.set(msg.player.id, msg.player)
        break

      case 'player_left':
        players.delete(msg.playerId)
        break

      case 'player_updated':
        if (msg.player.id !== playerId.value) {
          players.set(msg.player.id, msg.player)
        }
        break

      case 'changelog_entry':
        changelog.value.push(msg.changeLogEntry)
        if (changelog.value.length > MAX_CHANGELOG) {
          changelog.value = changelog.value.slice(-MAX_CHANGELOG)
        }
        break

      case 'host_changed':
        hostId.value = msg.hostId ?? ''
        break

      case 'game_finished':
        status.value = msg.status
        winnerId.value = msg.winnerId ?? ''
        finishedAt.value = msg.finishedAt
        break

      case 'error':
        console.error('Server error:', msg.message)
        if (msg.message === ERR_UNAVAILABLE && roomCode.value && !playerId.value) {
          // The server couldn't load the game (database hiccup): try again
          scheduleJoinRetry()
        } else if (msg.message === ERR_ROOM_FULL && roomCode.value && !playerId.value) {
          clearSession()
          resetState()
          notice.value = 'В комнате уже максимум игроков'
        } else if (msg.message === ERR_GAME_FINISHED && roomCode.value && !playerId.value) {
          // Tried to join a game that is already over
          clearSession()
          resetState()
          notice.value = 'Эта игра уже завершена'
        } else if (msg.message === ERR_ROOM_NOT_FOUND && roomCode.value) {
          clearSession()
          resetState()
          notice.value = 'Комната не найдена или уже закрыта'
        } else if (msg.message === ERR_SESSION_REPLACED) {
          // Another tab/device took over this session. Don't clear the stored
          // session (it belongs to the other tab now) and don't reconnect,
          // or the two connections would keep stealing it from each other.
          resetState()
          notice.value = 'Вы подключились к комнате с другой вкладки или устройства'
        }
        break
    }
  }

  function scheduleJoinRetry() {
    if (joinRetry) return
    joinRetry = setTimeout(() => {
      joinRetry = null
      if (roomCode.value && playerName.value && !playerId.value && connection.isConnected) {
        connection.send({
          type: 'join_room',
          roomCode: roomCode.value,
          playerName: playerName.value,
          sessionId: sessionId.value || undefined,
        })
      }
    }, JOIN_RETRY_DELAY)
  }

  function resetState() {
    if (joinRetry) {
      clearTimeout(joinRetry)
      joinRetry = null
    }
    connection.disconnect()
    players.clear()
    changelog.value = []
    roomCode.value = ''
    playerId.value = ''
    sessionId.value = ''
    status.value = 'active'
    winnerId.value = ''
    hostId.value = ''
    createdAt.value = 0
    finishedAt.value = 0
    joinedOnce = false
  }

  async function createRoom(name: string): Promise<string> {
    const data = await apiCreateRoom()

    notice.value = ''
    playerName.value = name
    roomCode.value = data.code
    await connectToRoom(data.code, name)

    return data.code
  }

  function joinRoom(code: string, name: string) {
    notice.value = ''
    playerName.value = name
    roomCode.value = code
    connectToRoom(code, name)
  }

  function rejoinRoom(code: string, name: string, existingSessionId: string) {
    playerName.value = name
    roomCode.value = code
    sessionId.value = existingSessionId
    connectToRoom(code, name, existingSessionId)
  }

  async function connectToRoom(code: string, name: string, existingSessionId?: string) {
    connection.connect()
    await connection.waitForConnection()
    connection.send({
      type: 'join_room',
      roomCode: code,
      playerName: name,
      sessionId: existingSessionId || undefined,
    })
    joinedOnce = true
  }

  function updateStats(stats: Partial<PlayerStats>) {
    const current = currentPlayer.value
    if (!current) return

    const updated: Player = { ...current, ...stats }
    players.set(playerId.value, updated)

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
  }

  /** Prepends the previous page of history to the changelog. */
  async function loadOlder() {
    const first = changelog.value[0]
    if (!first || first.seq <= 1 || loadingOlder.value) return
    loadingOlder.value = true
    try {
      const page = await getRoomEvents(roomCode.value, first.seq)
      // The changelog may have been replaced (reconnect) while loading
      const current = changelog.value[0]?.seq ?? Infinity
      const older = page.events.filter((e) => e.seq < current)
      changelog.value = [...older, ...changelog.value]
    } finally {
      loadingOlder.value = false
    }
  }

  /** Ends the game for everyone. Omit winnerId to finish without a winner. */
  function finishGame(winnerId?: string) {
    connection.send({ type: 'finish_game', winnerId: winnerId || undefined })
  }

  function leaveRoom() {
    connection.send({ type: 'leave_room' })
    resetState()
    clearSession()
  }

  return {
    roomCode,
    playerId,
    playerName,
    sessionId,
    players,
    changelog,
    notice,
    status,
    winnerId,
    hostId,
    host,
    isHost,
    createdAt,
    finishedAt,
    isFinished,
    winner,
    hasOlder,
    loadingOlder,
    connected,
    currentPlayer,
    otherPlayers,
    allPlayers,
    createRoom,
    joinRoom,
    rejoinRoom,
    updateStats,
    finishGame,
    loadOlder,
    leaveRoom,
  }
})
