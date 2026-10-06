<script setup lang="ts">
import { computed } from 'vue'
import { useRoomStore } from '@/stores/room'
import { CLASSES, RACES } from '@/constants'
import { getLabel } from '@/lib/labels'
import { formatDuration } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const emit = defineEmits<{ leave: [] }>()

const roomStore = useRoomStore()

const standings = computed(() =>
  [...roomStore.allPlayers].sort((a, b) => {
    if (a.id === roomStore.winnerId) return -1
    if (b.id === roomStore.winnerId) return 1
    return b.level - a.level || b.level + b.gearBonus - (a.level + a.gearBonus)
  }),
)

const duration = computed(() =>
  roomStore.createdAt && roomStore.finishedAt
    ? formatDuration(roomStore.finishedAt - roomStore.createdAt)
    : '',
)
</script>

<template>
  <Card class="border-2 border-primary/50 shadow-md overflow-hidden py-0">
    <div class="bg-primary/5 px-4 sm:px-6 py-5 text-center">
      <div class="text-4xl mb-2 select-none" aria-hidden="true">
        {{ roomStore.winner ? '🏆' : '🏁' }}
      </div>
      <h2 class="text-xl sm:text-2xl font-extrabold">Игра окончена</h2>
      <p v-if="roomStore.winner" class="text-base mt-1">
        Победитель: <span class="font-bold">{{ roomStore.winner.name }}</span>
      </p>
      <p v-else class="text-base text-muted-foreground mt-1">Без победителя</p>
      <p v-if="duration" class="text-sm text-muted-foreground mt-1">
        Длительность: {{ duration }}
      </p>
    </div>

    <CardContent class="px-4 sm:px-6 py-4 space-y-4">
      <ol class="space-y-2">
        <li
          v-for="(player, index) in standings"
          :key="player.id"
          class="flex items-center gap-3 rounded-lg px-3 py-2"
          :class="player.id === roomStore.winnerId ? 'bg-primary/10 font-semibold' : 'bg-secondary/30'"
        >
          <span class="w-6 text-center text-sm text-muted-foreground tabular-nums">
            {{ player.id === roomStore.winnerId ? '👑' : index + 1 }}
          </span>
          <div class="flex-1 min-w-0">
            <p class="truncate">
              {{ player.name }}
              <span v-if="player.id === roomStore.playerId" class="text-xs text-muted-foreground font-normal">(вы)</span>
            </p>
            <p class="text-xs text-muted-foreground font-normal">
              {{ getLabel(RACES, player.race) }} · {{ getLabel(CLASSES, player.class) }}
            </p>
          </div>
          <div class="text-right tabular-nums">
            <p class="text-sm">ур. {{ player.level }}</p>
            <p class="text-xs text-muted-foreground font-normal">сила {{ player.level + player.gearBonus }}</p>
          </div>
        </li>
      </ol>

      <Button class="w-full" variant="outline" @click="emit('leave')">
        В главное меню
      </Button>
    </CardContent>
  </Card>
</template>
