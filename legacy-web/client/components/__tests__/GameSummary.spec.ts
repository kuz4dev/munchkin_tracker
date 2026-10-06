import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import GameSummary from '../GameSummary.vue'
import { useRoomStore } from '@/stores/room'
import type { Player } from '@/types'

const mockWs = {
  status: ref<'connecting' | 'connected' | 'disconnected'>('connected'),
  connect: vi.fn(),
  disconnect: vi.fn(),
  send: vi.fn(),
  onMessage: vi.fn(),
}
vi.mock('@/composables/useWebSocket', () => ({ useWebSocket: () => mockWs }))
vi.mock('@/services/roomApi', () => ({ createRoom: vi.fn() }))

function player(id: string, name: string, level: number, gearBonus = 0): Player {
  return { id, name, level, gearBonus, gender: 'male', race: 'human', class: 'none', connected: true }
}

function finishGame(players: Player[], winnerId?: string) {
  useRoomStore()
  const calls = mockWs.onMessage.mock.calls
  calls[calls.length - 1]![0]({
    type: 'room_state', roomCode: 'ABC123', playerId: 'p2', sessionId: 's',
    status: 'finished', winnerId, createdAt: 1_000, finishedAt: 1_000 + 85 * 60_000, players,
  })
}

describe('GameSummary', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows the winner first, then others by level', () => {
    // Winner isn't necessarily the highest level (e.g. house rules)
    finishGame([player('p1', 'Алиса', 9), player('p2', 'Боб', 10), player('p3', 'Вася', 5)], 'p1')
    const wrapper = mount(GameSummary)

    expect(wrapper.text()).toContain('Победитель: Алиса')
    const rows = wrapper.findAll('li').map((li) => li.text())
    expect(rows[0]).toContain('Алиса')
    expect(rows[1]).toContain('Боб')
    expect(rows[1]).toContain('(вы)')
    expect(rows[2]).toContain('Вася')
  })

  it('handles a game without a winner and shows duration', () => {
    finishGame([player('p2', 'Боб', 4)])
    const wrapper = mount(GameSummary)

    expect(wrapper.text()).toContain('Без победителя')
    expect(wrapper.text()).toContain('1 ч 25 мин')
  })

  it('emits leave', async () => {
    finishGame([player('p2', 'Боб', 4)])
    const wrapper = mount(GameSummary)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('leave')).toHaveLength(1)
  })
})
