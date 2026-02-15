import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
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
}))

function makeEntry(overrides: Partial<ChangeLogEntry> = {}): ChangeLogEntry {
  return {
    timestamp: Date.now(),
    playerName: 'Alice',
    eventType: 'join',
    ...overrides,
  }
}

describe('ChangeLog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
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
        makeEntry({ playerName: 'Igor', eventType: 'stat_change', field: 'level', oldValue: '1', newValue: '2', timestamp: 1000 }),
        makeEntry({ playerName: 'Alice', eventType: 'stat_change', field: 'level', oldValue: '3', newValue: '4', timestamp: 1001 }),
      ]

      const wrapper = mount(ChangeLog)
      await wrapper.find('button').trigger('click')

      // Both should be separate lines, no "(N изм.)" text
      expect(wrapper.text()).toContain('Igor: уровень 1 → 2')
      expect(wrapper.text()).toContain('Alice: уровень 3 → 4')
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
