<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoomStore } from '@/stores/room'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const props = defineProps<{ open: boolean }>()

const roomStore = useRoomStore()

const NO_ALLY = '__none__'

const selectedPlayerId = ref<string>('')
const allyId = ref<string>(NO_ALLY)
const enemyPower = ref<number | null>(null)
const enemyPowerInput = ref('')
const playerCardBonus = ref(0)
const enemyCardBonus = ref(0)

const allPlayers = computed(() => roomStore.allPlayers)

const selectedPlayer = computed(() =>
  allPlayers.value.find(p => p.id === selectedPlayerId.value) ?? null
)

const ally = computed(() =>
  allyId.value && allyId.value !== NO_ALLY
    ? allPlayers.value.find(p => p.id === allyId.value) ?? null
    : null
)

const availableAllies = computed(() =>
  allPlayers.value.filter(p => p.id !== selectedPlayerId.value)
)

const playerBase = computed(() => {
  if (!selectedPlayer.value) return 0
  const base = selectedPlayer.value.level + selectedPlayer.value.gearBonus
  const allyPower = ally.value ? ally.value.level + ally.value.gearBonus : 0
  return base + allyPower
})

const playerPower = computed(() => playerBase.value + playerCardBonus.value)

const enemyTotalPower = computed(() => (enemyPower.value ?? 0) + enemyCardBonus.value)

type CombatResult = 'win' | 'lose' | 'draw' | null

const result = computed<CombatResult>(() => {
  if (!selectedPlayer.value || enemyPower.value === null) return null
  if (playerPower.value > enemyTotalPower.value) return 'win'
  if (playerPower.value < enemyTotalPower.value) return 'lose'
  return 'draw'
})

const margin = computed(() => {
  if (enemyPower.value === null) return 0
  return Math.abs(playerPower.value - enemyTotalPower.value)
})

function onEnemyInput(val: string) {
  enemyPowerInput.value = val
  const num = parseInt(val)
  enemyPower.value = isNaN(num) ? null : num
}

function onPlayerChange(val: string) {
  selectedPlayerId.value = val
  if (allyId.value === val) {
    allyId.value = NO_ALLY
  }
}

function formatBonus(n: number) {
  if (n > 0) return `+${n}`
  if (n < 0) return `${n}`
  return '0'
}

// Сбрасываем состояние когда диалог закрывается
watch(() => props.open, (val) => {
  if (!val) {
    selectedPlayerId.value = ''
    allyId.value = NO_ALLY
    enemyPower.value = null
    enemyPowerInput.value = ''
    playerCardBonus.value = 0
    enemyCardBonus.value = 0
  }
})
</script>

<template>
  <div class="space-y-4">
    <!-- Выбор игрока -->
    <div class="space-y-1.5">
      <Label>Игрок</Label>
      <Select :model-value="selectedPlayerId" @update:model-value="onPlayerChange">
        <SelectTrigger>
          <SelectValue placeholder="Выберите игрока..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="player in allPlayers" :key="player.id" :value="player.id">
            {{ player.name }}
            <span class="ml-1 text-muted-foreground text-xs">({{ player.level + player.gearBonus }})</span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Выбор союзника -->
    <div v-if="selectedPlayerId" class="space-y-1.5">
      <Label>Союзник <span class="text-muted-foreground text-xs font-normal">(необязательно)</span></Label>
      <Select :model-value="allyId" @update:model-value="allyId = $event">
        <SelectTrigger>
          <SelectValue placeholder="Без союзника" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="NO_ALLY">Без союзника</SelectItem>
          <SelectItem v-for="player in availableAllies" :key="player.id" :value="player.id">
            {{ player.name }}
            <span class="ml-1 text-muted-foreground text-xs">({{ player.level + player.gearBonus }})</span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Модификаторы карт -->
    <div v-if="selectedPlayerId" class="space-y-2">
      <Label>Карты</Label>
      <div class="space-y-1.5">
        <!-- Карты игрока -->
        <div class="flex items-center justify-between gap-3 bg-secondary/20 rounded-lg px-3 py-2">
          <span class="text-sm text-muted-foreground flex-1 min-w-0 truncate">
            {{ ally ? `${selectedPlayer!.name} + ${ally.name}` : selectedPlayer!.name }}
          </span>
          <div class="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="icon-sm"
              class="active:scale-90 transition-transform"
              @click="playerCardBonus--"
            >−</Button>
            <span
              class="w-8 text-center text-sm font-bold tabular-nums"
              :class="{
                'text-green-600 dark:text-green-400': playerCardBonus > 0,
                'text-red-600 dark:text-red-400': playerCardBonus < 0,
                'text-muted-foreground': playerCardBonus === 0,
              }"
            >{{ formatBonus(playerCardBonus) }}</span>
            <Button
              variant="outline"
              size="icon-sm"
              class="active:scale-90 transition-transform"
              @click="playerCardBonus++"
            >+</Button>
          </div>
        </div>

        <!-- Карты монстра -->
        <div class="flex items-center justify-between gap-3 bg-secondary/20 rounded-lg px-3 py-2">
          <span class="text-sm text-muted-foreground flex-1">Противник</span>
          <div class="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="icon-sm"
              class="active:scale-90 transition-transform"
              @click="enemyCardBonus--"
            >−</Button>
            <span
              class="w-8 text-center text-sm font-bold tabular-nums"
              :class="{
                'text-green-600 dark:text-green-400': enemyCardBonus > 0,
                'text-red-600 dark:text-red-400': enemyCardBonus < 0,
                'text-muted-foreground': enemyCardBonus === 0,
              }"
            >{{ formatBonus(enemyCardBonus) }}</span>
            <Button
              variant="outline"
              size="icon-sm"
              class="active:scale-90 transition-transform"
              @click="enemyCardBonus++"
            >+</Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Сила врага -->
    <div v-if="selectedPlayerId" class="space-y-1.5">
      <Label>Сила противника</Label>
      <Input
        min="1"
        type="number"
        placeholder="Введите силу..."
        :value="enemyPowerInput"
        @input="onEnemyInput(($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- Сводка сил -->
    <div v-if="selectedPlayerId && enemyPower !== null" class="flex items-center gap-2 justify-between">
      <div class="flex-1 bg-secondary/30 rounded-lg px-3 py-2 text-center">
        <p class="text-[10px] text-muted-foreground font-medium uppercase tracking-wider truncate">
          {{ ally ? `${selectedPlayer!.name} + ${ally.name}` : selectedPlayer!.name }}
        </p>
        <p class="text-2xl font-extrabold tabular-nums mt-0.5">{{ playerPower }}</p>
        <p v-if="playerCardBonus !== 0" class="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
          {{ playerBase }} {{ playerCardBonus > 0 ? '+' : '−' }} {{ Math.abs(playerCardBonus) }}
        </p>
      </div>

      <span class="text-lg font-bold text-muted-foreground">vs</span>

      <div class="flex-1 bg-secondary/30 rounded-lg px-3 py-2 text-center">
        <p class="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Противник</p>
        <p class="text-2xl font-extrabold tabular-nums mt-0.5">{{ enemyTotalPower }}</p>
        <p v-if="enemyCardBonus !== 0" class="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
          {{ enemyPower }} {{ enemyCardBonus > 0 ? '+' : '−' }} {{ Math.abs(enemyCardBonus) }}
        </p>
      </div>
    </div>

    <!-- Результат -->
    <div v-if="result" class="rounded-xl px-4 py-3 text-center" :class="{
      'bg-green-500/15 border border-green-500/30': result === 'win',
      'bg-red-500/15 border border-red-500/30': result === 'lose',
      'bg-yellow-500/15 border border-yellow-500/30': result === 'draw',
    }">
      <template v-if="result === 'win'">
        <p class="text-lg font-extrabold text-green-600 dark:text-green-400">Победа! 🎉</p>
        <p class="text-sm text-muted-foreground mt-0.5">Перевес: <span class="font-bold text-foreground">+{{ margin }}</span></p>
      </template>
      <template v-else-if="result === 'lose'">
        <p class="text-lg font-extrabold text-red-600 dark:text-red-400">Поражение 💀</p>
        <p class="text-sm text-muted-foreground mt-0.5">Перевес противника: <span class="font-bold text-foreground">+{{ margin }}</span></p>
      </template>
      <template v-else>
        <p class="text-lg font-extrabold text-yellow-600 dark:text-yellow-400">Ничья 🤝</p>
        <p class="text-sm text-muted-foreground mt-0.5">По правилам Манчкина — победитель монстр</p>
      </template>
    </div>
  </div>
</template>
