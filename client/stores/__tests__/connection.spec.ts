import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useConnectionStore } from '../connection'

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

describe('useConnectionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockWs.status.value = 'disconnected'
    vi.clearAllMocks()
  })

  it('isConnected is false when disconnected', () => {
    const store = useConnectionStore()
    expect(store.isConnected).toBe(false)
  })

  it('isConnected is true when connected', () => {
    mockWs.status.value = 'connected'
    const store = useConnectionStore()
    expect(store.isConnected).toBe(true)
  })

  it('connect builds correct ws URL', () => {
    const store = useConnectionStore()

    store.connect()

    // jsdom uses http://localhost:3000 by default
    expect(mockWs.connect).toHaveBeenCalledWith(
      expect.stringMatching(/^ws:\/\/localhost(:\d+)?\/ws$/),
    )
  })

  it('disconnect delegates to ws', () => {
    const store = useConnectionStore()
    store.disconnect()

    expect(mockWs.disconnect).toHaveBeenCalled()
  })

  it('send delegates to ws', () => {
    const store = useConnectionStore()
    const message = { type: 'leave_room' as const }
    store.send(message)

    expect(mockWs.send).toHaveBeenCalledWith(message)
  })

  it('onMessage delegates to ws', () => {
    const store = useConnectionStore()
    const handler = vi.fn()
    store.onMessage(handler)

    expect(mockWs.onMessage).toHaveBeenCalledWith(handler)
  })

  it('waitForConnection resolves immediately if already connected', async () => {
    mockWs.status.value = 'connected'
    const store = useConnectionStore()

    await expect(store.waitForConnection()).resolves.toBeUndefined()
  })

  it('waitForConnection resolves when status changes to connected', async () => {
    const store = useConnectionStore()

    const promise = store.waitForConnection()

    // Simulate connection established
    mockWs.status.value = 'connected'

    await expect(promise).resolves.toBeUndefined()
  })
})
