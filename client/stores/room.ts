import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { useConnectionStore } from './connection'
import { createRoom as apiCreateRoom } from '@/services/roomApi'
import type { Player, ServerMessage } from '@/types'

export const useRoomStore = defineStore('room', () => {
  const connection = useConnectionStore()

  const roomCode = ref('')
  const playerId = ref('')
  const playerName = ref('')
  const players = reactive(new Map<string, Player>())

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

  function handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'room_state': {
        players.clear()
        for (const p of msg.players) {
          players.set(p.id, p)
        }
        if (msg.players.length > 0 && !playerId.value) {
          playerId.value = msg.players[msg.players.length - 1]!.id
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
        players.set(msg.player.id, msg.player)
        break

      case 'error':
        console.error('Server error:', msg.message)
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

  async function connectToRoom(code: string, name: string) {
    connection.connect()
    await connection.waitForConnection()
    connection.send({
      type: 'join_room',
      roomCode: code,
      playerName: name,
    })
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
  }

  return {
    roomCode,
    playerId,
    playerName,
    players,
    connected,
    currentPlayer,
    otherPlayers,
    allPlayers,
    createRoom,
    joinRoom,
    updateStats,
    leaveRoom,
  }
})
