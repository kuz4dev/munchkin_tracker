import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useRoomForm } from '../useRoomForm'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
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

vi.mock('@/services/roomApi', () => ({
  createRoom: vi.fn(),
}))

import { createRoom as apiCreateRoom } from '@/services/roomApi'

describe('useRoomForm', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockWs.status.value = 'connected'
    vi.clearAllMocks()
  })

  describe('handleCreate', () => {
    it('sets error when name is empty', async () => {
      const { handleCreate, error } = useRoomForm()

      await handleCreate()

      expect(error.value).toBe('Введите ваше имя')
    })

    it('sets error when name is whitespace', async () => {
      const { handleCreate, playerName, error } = useRoomForm()
      playerName.value = '   '

      await handleCreate()

      expect(error.value).toBe('Введите ваше имя')
    })

    it('calls createRoom and navigates on success', async () => {
      vi.mocked(apiCreateRoom).mockResolvedValue({ code: 'ABC123', playerCount: 0 })

      const { handleCreate, playerName, loading, error } = useRoomForm()
      playerName.value = 'Alice'

      await handleCreate()

      expect(error.value).toBe('')
      expect(loading.value).toBe(false)
      expect(mockPush).toHaveBeenCalledWith({ name: 'room', params: { code: 'ABC123' } })
    })

    it('sets error on API failure', async () => {
      vi.mocked(apiCreateRoom).mockRejectedValue(new Error('Network error'))

      const { handleCreate, playerName, loading, error } = useRoomForm()
      playerName.value = 'Alice'

      await handleCreate()

      expect(error.value).toBe('Не удалось создать комнату')
      expect(loading.value).toBe(false)
    })

    it('trims player name', async () => {
      vi.mocked(apiCreateRoom).mockResolvedValue({ code: 'ABC123', playerCount: 0 })

      const { handleCreate, playerName } = useRoomForm()
      playerName.value = '  Alice  '

      await handleCreate()

      // The store's createRoom receives trimmed name
      const { useRoomStore } = await import('@/stores/room')
      const store = useRoomStore()
      expect(store.playerName).toBe('Alice')
    })
  })

  describe('handleJoin', () => {
    it('sets error when name is empty', () => {
      const { handleJoin, error } = useRoomForm()

      handleJoin()

      expect(error.value).toBe('Введите ваше имя')
    })

    it('sets error when room code is empty', () => {
      const { handleJoin, playerName, error } = useRoomForm()
      playerName.value = 'Bob'

      handleJoin()

      expect(error.value).toBe('Введите код комнаты')
    })

    it('uppercases room code and navigates', () => {
      const { handleJoin, playerName, roomCodeInput, error } = useRoomForm()
      playerName.value = 'Bob'
      roomCodeInput.value = 'abc123'

      handleJoin()

      expect(error.value).toBe('')
      expect(mockPush).toHaveBeenCalledWith({ name: 'room', params: { code: 'ABC123' } })
    })

    it('trims input values', () => {
      const { handleJoin, playerName, roomCodeInput } = useRoomForm()
      playerName.value = '  Bob  '
      roomCodeInput.value = '  abc123  '

      handleJoin()

      expect(mockPush).toHaveBeenCalledWith({ name: 'room', params: { code: 'ABC123' } })
    })
  })
})
