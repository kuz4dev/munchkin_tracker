import { computed } from 'vue'
import { useRoomStore } from '@/stores/room'
import { MAX_GEAR_BONUS, MAX_LEVEL, MIN_GEAR_BONUS, MIN_LEVEL } from '@/constants'
import type { PlayerStats } from '@/types'

export function usePlayerStats() {
  const roomStore = useRoomStore()

  const player = computed(() => roomStore.currentPlayer)
  const power = computed(() =>
    player.value ? player.value.level + player.value.gearBonus : 0,
  )

  function changeLevel(delta: number) {
    if (!player.value) return
    const newLevel = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, player.value.level + delta))
    roomStore.updateStats({ level: newLevel })
  }

  function changeGear(delta: number) {
    if (!player.value) return
    const newGear = Math.max(MIN_GEAR_BONUS, Math.min(MAX_GEAR_BONUS, player.value.gearBonus + delta))
    roomStore.updateStats({ gearBonus: newGear })
  }

  function updateAttribute<K extends keyof PlayerStats>(key: K, value: PlayerStats[K]) {
    roomStore.updateStats({ [key]: value })
  }

  return { player, power, changeLevel, changeGear, updateAttribute }
}
