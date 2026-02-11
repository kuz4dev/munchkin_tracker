<script setup lang="ts">
import { computed } from 'vue'
import { useRoomStore } from '@/stores/room'
import { CLASSES, GENDERS, RACES } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

function updateGender(value: string | number | bigint | Record<string, any> | null) {
  if (typeof value === 'string') roomStore.updateStats({ gender: value as 'male' | 'female' })
}

function updateRace(value: string | number | bigint | Record<string, any> | null) {
  if (typeof value === 'string') roomStore.updateStats({ race: value as 'human' | 'elf' | 'dwarf' | 'halfling' })
}

function updateClass(value: string | number | bigint | Record<string, any> | null) {
  if (typeof value === 'string') roomStore.updateStats({ class: value as 'none' | 'warrior' | 'wizard' | 'thief' | 'cleric' })
}
</script>

<template>
  <Card v-if="player" class="border-2 border-primary/50 shadow-md overflow-hidden">
    <!-- Power hero section -->
    <div class="bg-primary/5 px-4 sm:px-6 py-4 sm:py-5">
      <div class="flex items-center justify-between">
        <div class="min-w-0">
          <p class="text-sm text-muted-foreground font-medium">Ваш персонаж</p>
          <h2 class="text-lg sm:text-xl font-bold text-foreground truncate">{{ player.name }}</h2>
        </div>
        <div class="flex flex-col items-center bg-primary text-primary-foreground rounded-2xl px-4 sm:px-5 py-2 sm:py-3 shadow-sm shrink-0 ml-3">
          <span class="text-3xl sm:text-4xl font-extrabold leading-none">{{ power }}</span>
          <span class="text-[10px] sm:text-xs font-medium opacity-80 mt-0.5">СИЛА</span>
        </div>
      </div>
    </div>

    <CardContent class="px-4 sm:px-6 py-4 sm:py-5 space-y-5">
      <!-- Level & Gear in a row on mobile -->
      <div class="grid grid-cols-2 gap-3 sm:gap-4">
        <!-- Level -->
        <div class="bg-secondary/50 rounded-xl p-3 sm:p-4">
          <Label class="text-xs sm:text-sm font-medium text-muted-foreground">Уровень</Label>
          <div class="flex items-center justify-between mt-2">
            <Button
              variant="outline"
              size="icon"
              class="h-10 w-10 sm:h-11 sm:w-11 rounded-xl text-lg font-bold shrink-0 active:scale-90 transition-transform"
              :disabled="player.level <= 1"
              @click="changeLevel(-1)"
            >
              −
            </Button>
            <span class="text-2xl sm:text-3xl font-extrabold text-foreground tabular-nums">
              {{ player.level }}
            </span>
            <Button
              variant="outline"
              size="icon"
              class="h-10 w-10 sm:h-11 sm:w-11 rounded-xl text-lg font-bold shrink-0 active:scale-90 transition-transform"
              :disabled="player.level >= 10"
              @click="changeLevel(1)"
            >
              +
            </Button>
          </div>
        </div>

        <!-- Gear Bonus -->
        <div class="bg-secondary/50 rounded-xl p-3 sm:p-4">
          <Label class="text-xs sm:text-sm font-medium text-muted-foreground">Бонусы</Label>
          <div class="flex items-center justify-between mt-2">
            <Button
              variant="outline"
              size="icon"
              class="h-10 w-10 sm:h-11 sm:w-11 rounded-xl text-lg font-bold shrink-0 active:scale-90 transition-transform"
              :disabled="player.gearBonus <= 0"
              @click="changeGear(-1)"
            >
              −
            </Button>
            <span class="text-2xl sm:text-3xl font-extrabold text-foreground tabular-nums">
              {{ player.gearBonus }}
            </span>
            <Button
              variant="outline"
              size="icon"
              class="h-10 w-10 sm:h-11 sm:w-11 rounded-xl text-lg font-bold shrink-0 active:scale-90 transition-transform"
              @click="changeGear(1)"
            >
              +
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      <!-- Selects: stack on mobile, grid on desktop -->
      <div class="flex flex-wrap gap-1.5">
        <!-- Gender -->
        <div class="space-y-1.5">
          <Label class="text-xs sm:text-sm font-medium text-muted-foreground">Пол</Label>
          <Select :model-value="player.gender" @update:model-value="updateGender">
            <SelectTrigger class="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="g in GENDERS" :key="g.value" :value="g.value">
                {{ g.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Race -->
        <div class="space-y-1.5">
          <Label class="text-xs sm:text-sm font-medium text-muted-foreground">Раса</Label>
          <Select :model-value="player.race" @update:model-value="updateRace">
            <SelectTrigger class="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="r in RACES" :key="r.value" :value="r.value">
                {{ r.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Class -->
        <div class="space-y-1.5">
          <Label class="text-xs sm:text-sm font-medium text-muted-foreground">Класс</Label>
          <Select :model-value="player.class" @update:model-value="updateClass">
            <SelectTrigger class="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="c in CLASSES" :key="c.value" :value="c.value">
                {{ c.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
