import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { useConnectionStore } from './connection'
import { createRoom as apiCreateRoom } from '@/services/roomApi'
import { saveSession, clearSession } from '@/services/sessionStorage'
import type { ChangeLogEntry, Player, PlayerStats, ServerMessage } from '@/types'

/** Server error messages the client reacts to (see server/internal/room). */
const ERR_ROOM_NOT_FOUND = 'room not found'
const ERR_SESSION_REPLACED = 'session replaced'

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
  let joinedOnce = false // prevents watcher from double-sending join_room

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
        if (changelog.value.length > 100) {
          changelog.value = changelog.value.slice(-100)
        }
        break

      case 'error':
        console.error('Server error:', msg.message)
        if (msg.message === ERR_ROOM_NOT_FOUND && roomCode.value) {
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

  function resetState() {
    connection.disconnect()
    players.clear()
    changelog.value = []
    roomCode.value = ''
    playerId.value = ''
    sessionId.value = ''
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
    connected,
    currentPlayer,
    otherPlayers,
    allPlayers,
    createRoom,
    joinRoom,
    rejoinRoom,
    updateStats,
    leaveRoom,
  }
})
