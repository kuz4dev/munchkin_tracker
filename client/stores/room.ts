import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { useConnectionStore } from './connection'
import { createRoom as apiCreateRoom } from '@/services/roomApi'
import { saveSession, clearSession } from '@/services/sessionStorage'
import type { Player, ServerMessage } from '@/types'

export const useRoomStore = defineStore('room', () => {
  const connection = useConnectionStore()

  const roomCode = ref('')
  const playerId = ref('')
  const playerName = ref('')
  const sessionId = ref('')
  const players = reactive(new Map<string, Player>())
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
        if (msg.players.length > 0 && !playerId.value) {
          // If we have a sessionId (rejoin), find our player by it
          if (sessionId.value) {
            const self = msg.players.find((p) => p.sessionId === sessionId.value)
            if (self) {
              playerId.value = self.id
            }
          }
          // Fallback: take the last player (new join — we're always last)
          if (!playerId.value) {
            playerId.value = msg.players[msg.players.length - 1]!.id
          }
        }
        // Extract sessionId from our own player and persist
        const self = players.get(playerId.value)
        if (self?.sessionId) {
          sessionId.value = self.sessionId
        }
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

      case 'error':
        console.error('Server error:', msg.message)
        if (msg.message === 'room not found' && roomCode.value) {
          clearSession()
          connection.disconnect()
          roomCode.value = ''
          playerId.value = ''
          sessionId.value = ''
        }
        break
    }
  }

  async function createRoom(name: string): Promise<string> {
    const data = await apiCreateRoom()

    playerName.value = name
    roomCode.value = data.code
    await connectToRoom(data.code, name)

    return data.code
  }

  function joinRoom(code: string, name: string) {
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

  function updateStats(stats: Partial<Player>) {
    const current = currentPlayer.value
    if (!current) return

    const updated: Player = { ...current, ...stats }
    players.set(playerId.value, updated)

    connection.send({
      type: 'update_stats',
      player: updated,
    })
  }

  function leaveRoom() {
    connection.send({ type: 'leave_room' })
    connection.disconnect()
    players.clear()
    roomCode.value = ''
    playerId.value = ''
    sessionId.value = ''
    joinedOnce = false
    clearSession()
  }

  return {
    roomCode,
    playerId,
    playerName,
    sessionId,
    players,
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
