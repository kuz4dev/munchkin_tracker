import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerCard from '../PlayerCard.vue'
import type { Player } from '@/types'

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

describe('PlayerCard', () => {
  it('renders player name', () => {
    const wrapper = mount(PlayerCard, {
      props: { player: makePlayer({ name: 'Bob' }) },
    })
    expect(wrapper.text()).toContain('Bob')
  })

  it('renders power (level + gearBonus)', () => {
    const wrapper = mount(PlayerCard, {
      props: { player: makePlayer({ level: 5, gearBonus: 3 }) },
    })
    expect(wrapper.text()).toContain('8')
  })

  it('renders level', () => {
    const wrapper = mount(PlayerCard, {
      props: { player: makePlayer({ level: 7 }) },
    })
    expect(wrapper.text()).toContain('7')
  })

  it('renders gear bonus', () => {
    const wrapper = mount(PlayerCard, {
      props: { player: makePlayer({ gearBonus: 4 }) },
    })
    expect(wrapper.text()).toContain('4')
  })

  it('renders gender label in Russian', () => {
    const wrapper = mount(PlayerCard, {
      props: { player: makePlayer({ gender: 'female' }) },
    })
    expect(wrapper.text()).toContain('Женский')
  })

  it('renders race label in Russian', () => {
    const wrapper = mount(PlayerCard, {
      props: { player: makePlayer({ race: 'elf' }) },
    })
    expect(wrapper.text()).toContain('Эльф')
  })

  it('renders class label in Russian', () => {
    const wrapper = mount(PlayerCard, {
      props: { player: makePlayer({ class: 'wizard' }) },
    })
    expect(wrapper.text()).toContain('Волшебник')
  })
})
