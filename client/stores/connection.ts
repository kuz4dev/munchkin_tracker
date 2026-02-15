import { defineStore } from 'pinia'
import { computed, watch } from 'vue'
import { useWebSocket } from '@/composables/useWebSocket'
import type { ClientMessage, ServerMessage } from '@/types'

export const useConnectionStore = defineStore('connection', () => {
  const ws = useWebSocket()

  const isConnected = computed(() => ws.status.value === 'connected')
  const status = computed(() => ws.status.value)

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`
    ws.connect(wsUrl)
  }

  function disconnect() {
    ws.disconnect()
  }

  function send(message: ClientMessage) {
    ws.send(message)
  }

  function onMessage(handler: (message: ServerMessage) => void) {
    ws.onMessage(handler)
  }

  function waitForConnection(): Promise<void> {
    return new Promise((resolve) => {
      if (ws.status.value === 'connected') {
        resolve()
        return
      }
      const stop = watch(ws.status, (val) => {
        if (val === 'connected') {
          stop()
          resolve()
        }
      })
    })
  }

  return {
    isConnected,
    status,
    connect,
    disconnect,
    send,
    onMessage,
    waitForConnection,
  }
})
