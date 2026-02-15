<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useClipboard } from '@vueuse/core'
import { useRoomStore } from '@/stores/room'
import { loadSession, clearSession } from '@/services/sessionStorage'
import { getRoomInfo } from '@/services/roomApi'
import RoomHeader from '@/components/RoomHeader.vue'
import StatsEditor from '@/components/StatsEditor.vue'
import PlayerCard from '@/components/PlayerCard.vue'

const router = useRouter()
const route = useRoute()
const roomStore = useRoomStore()
const { copy } = useClipboard()

const rejoining = ref(false)

if (!roomStore.roomCode) {
  // Not in a room from normal flow — try session restore
  const session = loadSession()
  const routeCode = (route.params.code as string)?.toUpperCase()

  if (session && session.roomCode === routeCode) {
    rejoining.value = true
    tryRejoin(session.roomCode, session.playerName, session.sessionId)
  } else {
    router.replace({ name: 'home' })
  }
}

// Watch for roomCode clearing (e.g. server error "room not found")
watch(() => roomStore.roomCode, (code) => {
  if (!code && !rejoining.value) {
    router.replace({ name: 'home' })
  }
})

async function tryRejoin(code: string, name: string, sessionId: string) {
  try {
    await getRoomInfo(code)
    roomStore.rejoinRoom(code, name, sessionId)
  } catch {
    clearSession()
    router.replace({ name: 'home' })
  } finally {
    rejoining.value = false
  }
}

function copyRoomCode() {
  copy(roomStore.roomCode)
}
</script>

<template>
  <div class="min-h-dvh bg-background flex flex-col">
    <RoomHeader v-if="roomStore.roomCode" />

    <main class="flex-1 w-full max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5 sm:space-y-6 safe-area-bottom">
      <!-- Rejoining state -->
      <div
        v-if="rejoining"
        class="flex flex-col items-center justify-center py-12 sm:py-16 text-center"
      >
        <div class="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p class="text-base font-medium text-muted-foreground">
          Переподключение...
        </p>
      </div>

      <template v-else-if="roomStore.roomCode">
        <!-- Stats Editor for current player -->
        <StatsEditor />

        <!-- Other players -->
        <section v-if="roomStore.otherPlayers.length > 0">
          <div class="flex items-center gap-2 mb-3 sm:mb-4">
            <h2 class="text-base sm:text-lg font-bold text-foreground">Другие игроки</h2>
            <span class="text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
              {{ roomStore.otherPlayers.length }}
            </span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <PlayerCard
              v-for="player in roomStore.otherPlayers"
              :key="player.id"
              :player="player"
            />
          </div>
        </section>

        <!-- Waiting state -->
        <div
          v-else-if="roomStore.connected && roomStore.allPlayers.length <= 1"
          class="flex flex-col items-center justify-center py-12 sm:py-16 text-center"
        >
          <div class="text-4xl mb-4 animate-bounce select-none" aria-hidden="true">
            ⏳
          </div>
          <p class="text-base font-medium text-muted-foreground">
            Ожидание других игроков...
          </p>
          <p class="text-sm text-muted-foreground/70 mt-1">
            Поделитесь кодом комнаты
          </p>
          <button
            class="mt-3 text-sm font-mono font-bold bg-secondary hover:bg-accent px-4 py-2 rounded-lg transition-colors active:scale-95 cursor-pointer tracking-wider"
            @click="copyRoomCode"
          >
            {{ roomStore.roomCode }}
          </button>
        </div>

        <!-- Connecting state -->
        <div
          v-else-if="!roomStore.connected"
          class="flex flex-col items-center justify-center py-12 sm:py-16 text-center"
        >
          <div class="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p class="text-base font-medium text-muted-foreground">
            Подключение...
          </p>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.safe-area-bottom {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
</style>
