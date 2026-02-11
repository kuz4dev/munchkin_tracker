import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { useWebSocket } from '@/composables/useWebSocket'
import type { Player, ServerMessage } from '@/types'

export const useRoomStore = defineStore('room', () => {
  const roomCode = ref('')
  const playerId = ref('')
  const playerName = ref('')
  const players = reactive(new Map<string, Player>())

  const ws = useWebSocket()

  const connected = computed(() => ws.status.value === 'connected')
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

  ws.onMessage(handleMessage)

  function handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'room_state': {
        players.clear()
        const list = msg.players
        for (const p of list) {
          players.set(p.id, p)
        }
        if (list.length > 0 && !playerId.value) {
          playerId.value = list[list.length - 1]!.id
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
    const res = await fetch('/api/rooms', { method: 'POST' })
    const data = await res.json()
    const code = data.code as string

    playerName.value = name
    roomCode.value = code
    connectToRoom(code, name)

    return code
  }

  function joinRoom(code: string, name: string) {
    playerName.value = name
    roomCode.value = code
    connectToRoom(code, name)
  }

  function connectToRoom(code: string, name: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`

    ws.connect(wsUrl)

    const unwatch = setInterval(() => {
      if (ws.status.value === 'connected') {
        clearInterval(unwatch)
        ws.send({
          type: 'join_room',
          roomCode: code,
          playerName: name,
        })
      }
    }, 50)
  }

  function updateStats(stats: Partial<Player>) {
    const current = currentPlayer.value
    if (!current) return

    const updated: Player = { ...current, ...stats }
    players.set(playerId.value, updated)

    ws.send({
      type: 'update_stats',
      player: updated,
    })
  }

  function leaveRoom() {
    ws.send({ type: 'leave_room' })
    ws.disconnect()
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
