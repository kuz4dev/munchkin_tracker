import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RoomHeader from '../RoomHeader.vue'
import { useRoomStore } from '@/stores/room'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

const mockCopy = vi.fn()
const mockCopied = ref(false)
vi.mock('@vueuse/core', () => ({
  useClipboard: () => ({
    copy: mockCopy,
    copied: mockCopied,
  }),
}))

const mockWs = {
  status: ref<'connecting' | 'connected' | 'disconnected'>('connected'),
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

describe('RoomHeader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockWs.status.value = 'connected'
    mockCopied.value = false
    vi.clearAllMocks()
  })

  function mountWithRoomCode(code = 'ABC123') {
    const store = useRoomStore()
    store.roomCode = code
    return mount(RoomHeader)
  }

  it('displays room code', () => {
    const wrapper = mountWithRoomCode('XYZ789')
    expect(wrapper.text()).toContain('XYZ789')
  })

  it('shows online status when connected', () => {
    mockWs.status.value = 'connected'
    const wrapper = mountWithRoomCode()
    expect(wrapper.text()).toContain('Онлайн')
  })

  it('shows offline status when disconnected', () => {
    mockWs.status.value = 'disconnected'
    const wrapper = mountWithRoomCode()
    expect(wrapper.text()).toContain('Оффлайн')
  })

  it('copies room code on click', async () => {
    const wrapper = mountWithRoomCode('ABC123')

    // Find the copy button (contains room code text)
    const copyButton = wrapper.findAll('button').find((btn) => btn.text().includes('ABC123'))
    expect(copyButton).toBeDefined()

    await copyButton!.trigger('click')
    expect(mockCopy).toHaveBeenCalledWith('ABC123')
  })

  it('leave button navigates home', async () => {
    const wrapper = mountWithRoomCode()

    // Find the leave button (contains "Выйти" text)
    const leaveButton = wrapper.findAll('button').find((btn) => btn.text().includes('Выйти'))
    expect(leaveButton).toBeDefined()

    await leaveButton!.trigger('click')
    expect(mockPush).toHaveBeenCalledWith({ name: 'home' })
  })
})
