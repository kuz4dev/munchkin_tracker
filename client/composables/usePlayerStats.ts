import { computed } from 'vue'
import { useRoomStore } from '@/stores/room'
import type { Player } from '@/types'

export function usePlayerStats() {
  const roomStore = useRoomStore()

  const player = computed(() => roomStore.currentPlayer)
  const power = computed(() =>
    player.value ? player.value.level + player.value.gearBonus : 0,
  )

  function changeLevel(delta: number) {
    if (!player.value) return
    const newLevel = Math.max(1, Math.min(10, player.value.level + delta))
    roomStore.updateStats({ level: newLevel })
  }

  function changeGear(delta: number) {
    if (!player.value) return
    const newGear = Math.max(0, player.value.gearBonus + delta)
    roomStore.updateStats({ gearBonus: newGear })
  }

  function updateAttribute<K extends keyof Player>(key: K, value: Player[K]) {
    roomStore.updateStats({ [key]: value })
  }

  return { player, power, changeLevel, changeGear, updateAttribute }
}
