<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRoomStore } from '@/stores/room'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

const router = useRouter()
const roomStore = useRoomStore()

const playerName = ref('')
const roomCodeInput = ref('')
const loading = ref(false)
const error = ref('')

async function handleCreate() {
  if (!playerName.value.trim()) {
    error.value = 'Введите ваше имя'
    return
  }

  loading.value = true
  error.value = ''
  try {
    const code = await roomStore.createRoom(playerName.value.trim())
    router.push({ name: 'room', params: { code } })
  } catch (e) {
    error.value = 'Не удалось создать комнату'
  } finally {
    loading.value = false
  }
}

function handleJoin() {
  if (!playerName.value.trim()) {
    error.value = 'Введите ваше имя'
    return
  }
  if (!roomCodeInput.value.trim()) {
    error.value = 'Введите код комнаты'
    return
  }

  error.value = ''
  const code = roomCodeInput.value.trim().toUpperCase()
  roomStore.joinRoom(code, playerName.value.trim())
  router.push({ name: 'room', params: { code } })
}
</script>

<template>
  <div class="min-h-dvh flex flex-col items-center justify-center bg-background px-4 py-8 safe-area-inset">
    <!-- Decorative header -->
    <div class="mb-6 sm:mb-8 text-center">
      <div class="text-5xl sm:text-6xl mb-3 select-none" aria-hidden="true">
        🗡️
      </div>
      <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
        Манчкин
      </h1>
      <p class="text-base sm:text-lg text-muted-foreground mt-1">
        Трекер
      </p>
    </div>

    <Card class="w-full max-w-sm sm:max-w-md shadow-lg border-2">
      <CardHeader class="text-center pb-2 pt-5 sm:pt-6">
        <CardDescription class="text-sm sm:text-base">
          Отслеживайте характеристики игроков в реальном времени
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-5 px-5 sm:px-6 pb-6">
        <!-- Player name -->
        <div class="space-y-2">
          <Label for="name" class="text-sm font-medium">Ваше имя</Label>
          <Input
            id="name"
            v-model="playerName"
            placeholder="Введите имя игрока"
            class="h-12 text-base"
            autocomplete="off"
            @keyup.enter="handleCreate"
          />
        </div>

        <!-- Error message -->
        <div
          v-if="error"
          class="text-sm text-destructive font-medium bg-destructive/10 rounded-lg px-3 py-2 text-center"
        >
          {{ error }}
        </div>

        <!-- Create room button -->
        <Button
          class="w-full h-12 text-base font-semibold"
          :disabled="loading"
          @click="handleCreate"
        >
          {{ loading ? 'Создаём...' : 'Создать комнату' }}
        </Button>

        <!-- Divider -->
        <div class="flex items-center gap-4">
          <Separator class="flex-1" />
          <span class="text-sm text-muted-foreground whitespace-nowrap">или войдите</span>
          <Separator class="flex-1" />
        </div>

        <!-- Join room -->
        <div class="space-y-2">
          <Label for="code" class="text-sm font-medium">Код комнаты</Label>
          <div class="flex gap-2">
            <Input
              id="code"
              v-model="roomCodeInput"
              placeholder="ABC123"
              class="uppercase h-12 text-base tracking-widest font-mono"
              maxlength="6"
              autocomplete="off"
              @keyup.enter="handleJoin"
            />
            <Button
              variant="outline"
              class="h-12 px-5 text-base font-semibold shrink-0"
              @click="handleJoin"
            >
              Войти
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Footer hint -->
    <p class="mt-6 text-xs text-muted-foreground/70 text-center max-w-xs">
      Создайте комнату и поделитесь кодом с другими игроками
    </p>
  </div>
</template>

<style scoped>
.safe-area-inset {
  padding-bottom: max(2rem, env(safe-area-inset-bottom));
  padding-top: max(2rem, env(safe-area-inset-top));
}
</style>
