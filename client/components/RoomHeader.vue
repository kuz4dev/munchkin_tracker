<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRoomStore } from '@/stores/room'
import { Button } from '@/components/ui/button'

const router = useRouter()
const roomStore = useRoomStore()

const copied = ref(false)

function copyCode() {
  navigator.clipboard.writeText(roomStore.roomCode)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function leave() {
  roomStore.leaveRoom()
  router.push({ name: 'home' })
}
</script>

<template>
  <header class="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b-2 border-border/60 safe-area-top">
    <div class="max-w-4xl mx-auto px-3 sm:px-4">
      <div class="flex items-center justify-between h-14 sm:h-16">
        <!-- Left: title + room code -->
        <div class="flex items-center gap-2 sm:gap-3 min-w-0">
          <span class="text-lg sm:text-xl select-none shrink-0" aria-hidden="true">🗡️</span>
          <h1 class="text-base sm:text-lg font-bold truncate hidden sm:block">Манчкин</h1>
          <button
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-accent transition-colors active:scale-95 cursor-pointer"
            @click="copyCode"
          >
            <span class="font-mono text-sm sm:text-base font-bold tracking-wider text-foreground">
              {{ roomStore.roomCode }}
            </span>
            <svg
              v-if="!copied"
              class="w-4 h-4 text-muted-foreground shrink-0"
              xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <svg
              v-else
              class="w-4 h-4 text-game-green shrink-0"
              xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>

        <!-- Right: status + leave -->
        <div class="flex items-center gap-2 sm:gap-3 shrink-0">
          <div
            class="flex items-center gap-1.5"
            :class="roomStore.connected ? 'text-game-green' : 'text-destructive'"
          >
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :class="roomStore.connected ? 'bg-game-green animate-pulse' : 'bg-destructive'"
            />
            <span class="text-xs sm:text-sm font-medium hidden sm:inline">
              {{ roomStore.connected ? 'Онлайн' : 'Оффлайн' }}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            class="text-muted-foreground hover:text-destructive h-9 px-2.5 sm:px-3"
            @click="leave"
          >
            <svg
              class="w-4 h-4 sm:mr-1.5"
              xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span class="hidden sm:inline text-sm">Выйти</span>
          </Button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.safe-area-top {
  padding-top: env(safe-area-inset-top);
}
</style>
