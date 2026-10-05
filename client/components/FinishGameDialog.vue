<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoomStore } from '@/stores/room'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{
  /** Preselected winner, e.g. the player who just reached the last level */
  suggestedWinnerId?: string
}>()

const roomStore = useRoomStore()

const NO_WINNER = '__none__'
const selectedWinner = ref(NO_WINNER)

const players = computed(() =>
  [...roomStore.allPlayers].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)),
)

const title = computed(() => {
  if (!props.suggestedWinnerId) return 'Завершить игру'
  if (props.suggestedWinnerId === roomStore.playerId) return 'Победа? 🏆'
  const name = roomStore.players.get(props.suggestedWinnerId)?.name
  return name ? `Победа: ${name}? 🏆` : 'Завершить игру'
})

watch(open, (isOpen) => {
  if (isOpen) {
    selectedWinner.value = props.suggestedWinnerId || NO_WINNER
  }
})

function onWinnerChange(value: unknown) {
  if (typeof value === 'string') selectedWinner.value = value
}

function confirm() {
  roomStore.finishGame(selectedWinner.value === NO_WINNER ? undefined : selectedWinner.value)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogClose />
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
      </DialogHeader>

      <div class="space-y-4 mt-2">
        <p class="text-sm text-muted-foreground">
          Игра завершится для всех игроков. Менять характеристики после этого будет нельзя.
        </p>

        <div class="space-y-1.5">
          <Label>Победитель</Label>
          <Select :model-value="selectedWinner" @update:model-value="onWinnerChange">
            <SelectTrigger class="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="NO_WINNER">Без победителя</SelectItem>
              <SelectItem v-for="player in players" :key="player.id" :value="player.id">
                {{ player.name }}
                <span class="ml-1 text-muted-foreground text-xs">(ур. {{ player.level }})</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="flex gap-2 justify-end">
          <Button variant="outline" @click="open = false">Продолжить игру</Button>
          <Button @click="confirm">Завершить</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
