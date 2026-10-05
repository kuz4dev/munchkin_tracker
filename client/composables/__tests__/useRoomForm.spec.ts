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
  getRoomInfo: vi.fn(),
}))

import { createRoom as apiCreateRoom, getRoomInfo } from '@/services/roomApi'

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
    it('sets error when name is empty', async () => {
      const { handleJoin, error } = useRoomForm()

      await handleJoin()

      expect(error.value).toBe('Введите ваше имя')
    })

    it('sets error when room code is empty', async () => {
      const { handleJoin, playerName, error } = useRoomForm()
      playerName.value = 'Bob'

      await handleJoin()

      expect(error.value).toBe('Введите код комнаты')
    })

    it('uppercases room code and navigates', async () => {
      vi.mocked(getRoomInfo).mockResolvedValue({ code: 'ABC123', playerCount: 1 })
      const { handleJoin, playerName, roomCodeInput, error } = useRoomForm()
      playerName.value = 'Bob'
      roomCodeInput.value = 'abc123'

      await handleJoin()

      expect(error.value).toBe('')
      expect(mockPush).toHaveBeenCalledWith({ name: 'room', params: { code: 'ABC123' } })
    })

    it('trims input values', async () => {
      vi.mocked(getRoomInfo).mockResolvedValue({ code: 'ABC123', playerCount: 1 })
      const { handleJoin, playerName, roomCodeInput } = useRoomForm()
      playerName.value = '  Bob  '
      roomCodeInput.value = '  abc123  '

      await handleJoin()

      expect(getRoomInfo).toHaveBeenCalledWith('ABC123')
      expect(mockPush).toHaveBeenCalledWith({ name: 'room', params: { code: 'ABC123' } })
    })

    it('shows error and stays on page when room does not exist', async () => {
      vi.mocked(getRoomInfo).mockRejectedValue(new Error('404'))
      const { handleJoin, playerName, roomCodeInput, error, loading } = useRoomForm()
      playerName.value = 'Bob'
      roomCodeInput.value = 'NOPE00'

      await handleJoin()

      expect(error.value).toBe('Комната не найдена')
      expect(loading.value).toBe(false)
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('prefills room code from a shared link', () => {
      const { roomCodeInput } = useRoomForm('ABC123')
      expect(roomCodeInput.value).toBe('ABC123')
    })
  })
})
