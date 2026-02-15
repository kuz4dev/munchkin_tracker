import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import StatsEditor from '../StatsEditor.vue'
import { useRoomStore } from '@/stores/room'
import type { Player } from '@/types'

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

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'Alice',
    level: 5,
    gearBonus: 3,
    gender: 'female',
    race: 'elf',
    class: 'wizard',
    ...overrides,
  }
}

function setupPlayerInStore(player: Player) {
  const roomStore = useRoomStore()
  const calls = mockWs.onMessage.mock.calls
  const handler = calls[calls.length - 1]![0]
  handler({
    type: 'room_state',
    roomCode: 'ABC',
    players: [player],
  })
  return roomStore
}

describe('StatsEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('does not render when no current player', () => {
    useRoomStore()
    const wrapper = mount(StatsEditor)
    expect(wrapper.find('[class*="border-primary"]').exists()).toBe(false)
  })

  it('renders player name and power when player exists', () => {
    setupPlayerInStore(makePlayer({ name: 'Alice', level: 5, gearBonus: 3 }))
    const wrapper = mount(StatsEditor)

    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('8') // power = 5 + 3
  })

  it('renders level and gear bonus values', () => {
    setupPlayerInStore(makePlayer({ level: 7, gearBonus: 4 }))
    const wrapper = mount(StatsEditor)

    expect(wrapper.text()).toContain('7')
    expect(wrapper.text()).toContain('4')
  })

  it('level decrement button is disabled at level 1', () => {
    setupPlayerInStore(makePlayer({ level: 1 }))
    const wrapper = mount(StatsEditor)

    const buttons = wrapper.findAll('button')
    // First button in the level section is the decrement button
    const levelDecrementBtn = buttons.find(
      (btn) => btn.text() === '−' && btn.element.closest('.bg-secondary\\/50'),
    )
    // Find by disabled attribute among minus buttons
    const disabledMinusButtons = buttons.filter(
      (btn) => btn.text() === '−' && btn.attributes('disabled') !== undefined,
    )
    expect(disabledMinusButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('level increment button is disabled at level 10', () => {
    setupPlayerInStore(makePlayer({ level: 10 }))
    const wrapper = mount(StatsEditor)

    const buttons = wrapper.findAll('button')
    const disabledPlusButtons = buttons.filter(
      (btn) => btn.text() === '+' && btn.attributes('disabled') !== undefined,
    )
    expect(disabledPlusButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('gear decrement button is disabled at 0', () => {
    setupPlayerInStore(makePlayer({ gearBonus: 0 }))
    const wrapper = mount(StatsEditor)

    const buttons = wrapper.findAll('button')
    const disabledMinusButtons = buttons.filter(
      (btn) => btn.text() === '−' && btn.attributes('disabled') !== undefined,
    )
    expect(disabledMinusButtons.length).toBeGreaterThanOrEqual(1)
  })
})
