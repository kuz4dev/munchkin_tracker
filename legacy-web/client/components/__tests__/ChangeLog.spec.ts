import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ChangeLog from '../ChangeLog.vue'
import { useRoomStore } from '@/stores/room'
import type { ChangeLogEntry } from '@/types'

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
  getRoomEvents: vi.fn(),
}))

import { getRoomEvents } from '@/services/roomApi'

let nextSeq = 1

function makeEntry(overrides: Partial<ChangeLogEntry> = {}): ChangeLogEntry {
  return {
    seq: nextSeq++,
    timestamp: Date.now(),
    playerId: 'p-alice',
    playerName: 'Alice',
    eventType: 'join',
    ...overrides,
  }
}

describe('ChangeLog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    nextSeq = 1
  })

  describe('history', () => {
    it('hides "load earlier" when the first event is loaded', async () => {
      const store = useRoomStore()
      store.changelog = [makeEntry({ seq: 1 }), makeEntry({ seq: 2 })]
      const wrapper = mount(ChangeLog)
      await wrapper.find('button').trigger('click')
      expect(wrapper.text()).not.toContain('Показать более ранние')
    })

    it('loads earlier events and keeps expanded groups', async () => {
      const store = useRoomStore()
      store.roomCode = 'ABC123'
      const levelUp = (seq: number, from: number) =>
        makeEntry({ seq, eventType: 'stat_change', field: 'level', oldValue: String(from), newValue: String(from + 1) })
      store.changelog = [levelUp(51, 3), levelUp(52, 4)]
      vi.mocked(getRoomEvents).mockResolvedValue({
        events: [makeEntry({ seq: 49, playerName: 'Bob', eventType: 'join' }), makeEntry({ seq: 50, playerName: 'Bob', eventType: 'leave' })],
        hasMore: true,
      })

      const wrapper = mount(ChangeLog)
      await wrapper.find('button').trigger('click') // open panel
      const group = wrapper.findAll('button').find((b) => b.text().includes('(2 изм.)'))!
      await group.trigger('click') // expand the level group
      expect(wrapper.text()).toContain('уровень 3 → 4')

      const more = wrapper.findAll('button').find((b) => b.text() === 'Показать более ранние')!
      await more.trigger('click')
      await flushPromises()

      expect(getRoomEvents).toHaveBeenCalledWith('ABC123', 51)
      expect(store.changelog.map((e) => e.seq)).toEqual([49, 50, 51, 52])
      expect(wrapper.text()).toContain('Bob присоединился')
      // The same group is still expanded after prepending
      expect(wrapper.text()).toContain('уровень 3 → 4')
      expect(wrapper.text()).toContain('Показать более ранние')
    })

    it('offers a retry when loading fails', async () => {
      const store = useRoomStore()
      store.roomCode = 'ABC123'
      store.changelog = [makeEntry({ seq: 10 })]
      vi.mocked(getRoomEvents).mockRejectedValue(new Error('offline'))

      const wrapper = mount(ChangeLog)
      await wrapper.find('button').trigger('click')
      await wrapper.findAll('button').find((b) => b.text() === 'Показать более ранние')!.trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('Не удалось загрузить, повторить')
      expect(store.changelog).toHaveLength(1)
    })
  })

  it('renders "Журнал" title', () => {
    const wrapper = mount(ChangeLog)
    expect(wrapper.text()).toContain('Журнал')
  })

  it('shows total entry count badge when entries exist', () => {
    const store = useRoomStore()
    store.changelog = [makeEntry(), makeEntry()]

    const wrapper = mount(ChangeLog)
    expect(wrapper.text()).toContain('2')
  })

  it('does not show count badge when empty', () => {
    const wrapper = mount(ChangeLog)
    expect(wrapper.text()).not.toMatch(/\d+/)
  })

  it('formats finish entries', async () => {
    const store = useRoomStore()
    store.changelog = [
      makeEntry({ seq: 1, eventType: 'finish', newValue: 'Bob' }),
      makeEntry({ seq: 2, eventType: 'finish', newValue: '' }),
    ]

    const wrapper = mount(ChangeLog)
    await wrapper.find('button').trigger('click')

    expect(wrapper.text()).toContain('Игра окончена, победитель: Bob')
    expect(wrapper.text()).toContain('Игра окончена без победителя')
  })

  it('formats join entry correctly', async () => {
    const store = useRoomStore()
    store.changelog = [makeEntry({ playerName: 'Bob', eventType: 'join' })]

    const wrapper = mount(ChangeLog)
    await wrapper.find('button').trigger('click')

    expect(wrapper.text()).toContain('Bob присоединился')
  })

  it('formats leave entry correctly', async () => {
    const store = useRoomStore()
    store.changelog = [makeEntry({ playerName: 'Eve', eventType: 'leave' })]

    const wrapper = mount(ChangeLog)
    await wrapper.find('button').trigger('click')

    expect(wrapper.text()).toContain('Eve вышел')
  })

  it('formats level stat_change entry', async () => {
    const store = useRoomStore()
    store.changelog = [makeEntry({
      playerName: 'Alice',
      eventType: 'stat_change',
      field: 'level',
      oldValue: '1',
      newValue: '3',
    })]

    const wrapper = mount(ChangeLog)
    await wrapper.find('button').trigger('click')

    expect(wrapper.text()).toContain('Alice: уровень 1 → 3')
  })

  it('formats race change with Russian labels', async () => {
    const store = useRoomStore()
    store.changelog = [makeEntry({
      playerName: 'Alice',
      eventType: 'stat_change',
      field: 'race',
      oldValue: 'human',
      newValue: 'elf',
    })]

    const wrapper = mount(ChangeLog)
    await wrapper.find('button').trigger('click')

    expect(wrapper.text()).toContain('Alice: раса Человек → Эльф')
  })

  it('formats class change with Russian labels', async () => {
    const store = useRoomStore()
    store.changelog = [makeEntry({
      playerName: 'Bob',
      eventType: 'stat_change',
      field: 'class',
      oldValue: 'none',
      newValue: 'warrior',
    })]

    const wrapper = mount(ChangeLog)
    await wrapper.find('button').trigger('click')

    expect(wrapper.text()).toContain('Bob: класс Без класса → Воин')
  })

  it('shows empty state when opened with no entries', async () => {
    const wrapper = mount(ChangeLog)
    await wrapper.find('button').trigger('click')

    expect(wrapper.text()).toContain('Пока нет событий')
  })

  describe('grouping', () => {
    it('groups consecutive same-player same-field stat_change entries', async () => {
      const store = useRoomStore()
      store.changelog = [
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'gearBonus', oldValue: '7', newValue: '8', timestamp: 1000 }),
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'gearBonus', oldValue: '8', newValue: '9', timestamp: 1001 }),
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'gearBonus', oldValue: '9', newValue: '11', timestamp: 1002 }),
      ]

      const wrapper = mount(ChangeLog)
      await wrapper.find('button').trigger('click')

      // Should show summary: 7 → 11 with count
      expect(wrapper.text()).toContain('Igor: бонусы 7 → 11')
      expect(wrapper.text()).toContain('3 изм.')
    })

    it('shows expand arrow for grouped entries', async () => {
      const store = useRoomStore()
      store.changelog = [
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'level', oldValue: '1', newValue: '2', timestamp: 1000 }),
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'level', oldValue: '2', newValue: '3', timestamp: 1001 }),
      ]

      const wrapper = mount(ChangeLog)
      await wrapper.find('button').trigger('click')

      // Should have an expand button inside the group
      const groupButtons = wrapper.findAll('button')
      // First button is the Журнал toggle, second is the group expand
      expect(groupButtons.length).toBeGreaterThanOrEqual(2)
    })

    it('expands group to show individual steps on click', async () => {
      const store = useRoomStore()
      store.changelog = [
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'gearBonus', oldValue: '7', newValue: '8', timestamp: 1000 }),
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'gearBonus', oldValue: '8', newValue: '9', timestamp: 1001 }),
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'gearBonus', oldValue: '9', newValue: '11', timestamp: 1002 }),
      ]

      const wrapper = mount(ChangeLog)
      // Open the collapsible panel
      await wrapper.find('button').trigger('click')

      // Before expanding: individual steps should not be visible
      expect(wrapper.text()).not.toContain('бонусы 7 → 8')

      // Click on the group expand button (second button in DOM)
      const groupButton = wrapper.findAll('button')[1]!
      await groupButton.trigger('click')

      // After expanding: individual steps should be visible
      expect(wrapper.text()).toContain('бонусы 7 → 8')
      expect(wrapper.text()).toContain('бонусы 8 → 9')
      expect(wrapper.text()).toContain('бонусы 9 → 11')
    })

    it('does not group entries from different players', async () => {
      const store = useRoomStore()
      store.changelog = [
        makeEntry({ playerId: 'p-igor', playerName: 'Igor', eventType: 'stat_change', field: 'level', oldValue: '1', newValue: '2', timestamp: 1000 }),
        makeEntry({ playerId: 'p-alice', playerName: 'Alice', eventType: 'stat_change', field: 'level', oldValue: '3', newValue: '4', timestamp: 1001 }),
      ]

      const wrapper = mount(ChangeLog)
      await wrapper.find('button').trigger('click')

      // Both should be separate lines, no "(N изм.)" text
      expect(wrapper.text()).toContain('Igor: уровень 1 → 2')
      expect(wrapper.text()).toContain('Alice: уровень 3 → 4')
      expect(wrapper.text()).not.toContain('изм.')
    })

    it('does not group entries from different players with the same name', async () => {
      const store = useRoomStore()
      store.changelog = [
        makeEntry({ playerId: 'p1', playerName: 'Igor', eventType: 'stat_change', field: 'level', oldValue: '1', newValue: '2', timestamp: 1000 }),
        makeEntry({ playerId: 'p2', playerName: 'Igor', eventType: 'stat_change', field: 'level', oldValue: '3', newValue: '4', timestamp: 1001 }),
      ]

      const wrapper = mount(ChangeLog)
      await wrapper.find('button').trigger('click')

      expect(wrapper.text()).toContain('Igor: уровень 1 → 2')
      expect(wrapper.text()).toContain('Igor: уровень 3 → 4')
      expect(wrapper.text()).not.toContain('изм.')
    })

    it('does not group entries for different fields', async () => {
      const store = useRoomStore()
      store.changelog = [
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'level', oldValue: '1', newValue: '2', timestamp: 1000 }),
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'gearBonus', oldValue: '0', newValue: '1', timestamp: 1001 }),
      ]

      const wrapper = mount(ChangeLog)
      await wrapper.find('button').trigger('click')

      expect(wrapper.text()).toContain('Igor: уровень 1 → 2')
      expect(wrapper.text()).toContain('Igor: бонусы 0 → 1')
      expect(wrapper.text()).not.toContain('изм.')
    })

    it('does not group join/leave events', async () => {
      const store = useRoomStore()
      store.changelog = [
        makeEntry({ playerName: 'Igor', eventType: 'join', timestamp: 1000 }),
        makeEntry({ playerName: 'Igor', eventType: 'join', timestamp: 1001 }),
      ]

      const wrapper = mount(ChangeLog)
      await wrapper.find('button').trigger('click')

      // Two separate "присоединился" lines, no expand/group
      const text = wrapper.text()
      const matches = text.match(/присоединился/g)
      expect(matches).toHaveLength(2)
      expect(text).not.toContain('изм.')
    })

    it('breaks group when different event interrupts', async () => {
      const store = useRoomStore()
      store.changelog = [
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'level', oldValue: '1', newValue: '2', timestamp: 1000 }),
        makeEntry({ playerName: 'Alice', eventType: 'join', timestamp: 1001 }),
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'level', oldValue: '2', newValue: '3', timestamp: 1002 }),
      ]

      const wrapper = mount(ChangeLog)
      await wrapper.find('button').trigger('click')

      // All three should be separate
      expect(wrapper.text()).toContain('Igor: уровень 1 → 2')
      expect(wrapper.text()).toContain('Alice присоединился')
      expect(wrapper.text()).toContain('Igor: уровень 2 → 3')
      expect(wrapper.text()).not.toContain('изм.')
    })
  })
})
