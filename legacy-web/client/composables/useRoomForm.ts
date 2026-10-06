import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRoomStore } from '@/stores/room'
import { getRoomInfo } from '@/services/roomApi'

export function useRoomForm(initialRoomCode = '') {
  const router = useRouter()
  const roomStore = useRoomStore()

  const playerName = ref('')
  const roomCodeInput = ref(initialRoomCode)
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

  async function handleJoin() {
    if (!playerName.value.trim()) {
      error.value = 'Введите ваше имя'
      return
    }
    if (!roomCodeInput.value.trim()) {
      error.value = 'Введите код комнаты'
      return
    }

    loading.value = true
    error.value = ''
    const code = roomCodeInput.value.trim().toUpperCase()
    try {
      await getRoomInfo(code)
    } catch {
      error.value = 'Комната не найдена'
      return
    } finally {
      loading.value = false
    }
    roomStore.joinRoom(code, playerName.value.trim())
    router.push({ name: 'room', params: { code } })
  }

  return { playerName, roomCodeInput, loading, error, handleCreate, handleJoin }
}
