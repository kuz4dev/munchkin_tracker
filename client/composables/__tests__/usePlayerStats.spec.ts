import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStats } from '../usePlayerStats'
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
  // Get the message handler that the room store registered
  const calls = mockWs.onMessage.mock.calls
  const handler = calls[calls.length - 1]![0]
  handler({
    type: 'room_state',
    roomCode: 'ABC',
    players: [player],
  })
  return roomStore
}

describe('usePlayerStats', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('player is undefined when no current player', () => {
    useRoomStore() // initialize store so composable works
    const { player } = usePlayerStats()
    expect(player.value).toBeUndefined()
  })

  it('power computes level + gearBonus', () => {
    setupPlayerInStore(makePlayer({ level: 5, gearBonus: 3 }))

    const { power } = usePlayerStats()
    expect(power.value).toBe(8)
  })

  it('power is 0 when no player', () => {
    useRoomStore()
    const { power } = usePlayerStats()
    expect(power.value).toBe(0)
  })

  it('changeLevel increments within bounds', () => {
    const roomStore = setupPlayerInStore(makePlayer({ level: 5 }))
    const spy = vi.spyOn(roomStore, 'updateStats')

    const { changeLevel } = usePlayerStats()
    changeLevel(1)

    expect(spy).toHaveBeenCalledWith({ level: 6 })
  })

  it('changeLevel does not go below 1', () => {
    const roomStore = setupPlayerInStore(makePlayer({ level: 1 }))
    const spy = vi.spyOn(roomStore, 'updateStats')

    const { changeLevel } = usePlayerStats()
    changeLevel(-1)

    expect(spy).toHaveBeenCalledWith({ level: 1 })
  })

  it('changeLevel does not go above 10', () => {
    const roomStore = setupPlayerInStore(makePlayer({ level: 10 }))
    const spy = vi.spyOn(roomStore, 'updateStats')

    const { changeLevel } = usePlayerStats()
    changeLevel(1)

    expect(spy).toHaveBeenCalledWith({ level: 10 })
  })

  it('changeGear increments', () => {
    const roomStore = setupPlayerInStore(makePlayer({ gearBonus: 3 }))
    const spy = vi.spyOn(roomStore, 'updateStats')

    const { changeGear } = usePlayerStats()
    changeGear(1)

    expect(spy).toHaveBeenCalledWith({ gearBonus: 4 })
  })

  it('changeGear does not go below 0', () => {
    const roomStore = setupPlayerInStore(makePlayer({ gearBonus: 0 }))
    const spy = vi.spyOn(roomStore, 'updateStats')

    const { changeGear } = usePlayerStats()
    changeGear(-1)

    expect(spy).toHaveBeenCalledWith({ gearBonus: 0 })
  })

  it('changeLevel does nothing without a player', () => {
    const roomStore = useRoomStore()
    const spy = vi.spyOn(roomStore, 'updateStats')

    const { changeLevel } = usePlayerStats()
    changeLevel(1)

    expect(spy).not.toHaveBeenCalled()
  })

  it('changeGear does nothing without a player', () => {
    const roomStore = useRoomStore()
    const spy = vi.spyOn(roomStore, 'updateStats')

    const { changeGear } = usePlayerStats()
    changeGear(1)

    expect(spy).not.toHaveBeenCalled()
  })

  it('updateAttribute calls roomStore.updateStats', () => {
    const roomStore = setupPlayerInStore(makePlayer())
    const spy = vi.spyOn(roomStore, 'updateStats')

    const { updateAttribute } = usePlayerStats()
    updateAttribute('gender', 'male')

    expect(spy).toHaveBeenCalledWith({ gender: 'male' })
  })
})
