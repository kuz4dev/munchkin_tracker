import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRoomStore } from '@/stores/room'

export function useRoomForm() {
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
    } catch {
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

  return { playerName, roomCodeInput, loading, error, handleCreate, handleJoin }
}
