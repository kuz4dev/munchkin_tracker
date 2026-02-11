<script setup lang="ts">
import type { Player } from '@/types'
import { CLASSES, GENDERS, RACES } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

defineProps<{
  player: Player
}>()

function getLabel(list: { value: string; label: string }[], value: string): string {
  return list.find((item) => item.value === value)?.label ?? value
}
</script>

<template>
  <Card class="overflow-hidden transition-all hover:shadow-md border-2">
    <!-- Top bar: name + power -->
    <div class="flex items-center justify-between px-4 py-3 bg-secondary/40">
      <h3 class="font-bold text-base truncate text-foreground mr-2">
        {{ player.name }}
      </h3>
      <div class="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-xl px-3 py-1.5 shrink-0">
        <span class="text-xl font-extrabold leading-none tabular-nums">{{ player.level + player.gearBonus }}</span>
        <span class="text-[10px] font-medium opacity-80">СИЛА</span>
      </div>
    </div>

    <CardContent class="px-4 py-3 space-y-2.5">
      <!-- Stats row -->
      <div class="flex gap-3">
        <div class="flex-1 bg-secondary/30 rounded-lg px-3 py-2 text-center">
          <p class="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Уровень</p>
          <p class="text-lg font-bold text-foreground tabular-nums mt-0.5">{{ player.level }}</p>
        </div>
        <div class="flex-1 bg-secondary/30 rounded-lg px-3 py-2 text-center">
          <p class="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Бонусы</p>
          <p class="text-lg font-bold text-foreground tabular-nums mt-0.5">{{ player.gearBonus }}</p>
        </div>
      </div>

      <!-- Traits -->
      <div class="flex flex-wrap gap-1.5">
        <Badge variant="outline" class="flex-1 text-xs px-2 py-0.5">{{ getLabel(GENDERS, player.gender) }}</Badge>
        <Badge variant="outline" class="flex-1 text-xs px-2 py-0.5">{{ getLabel(RACES, player.race) }}</Badge>
        <Badge variant="outline" class="flex-1 text-xs px-2 py-0.5">{{ getLabel(CLASSES, player.class) }}</Badge>
      </div>
    </CardContent>
  </Card>
</template>
