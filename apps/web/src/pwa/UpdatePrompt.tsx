import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'

const HOUR = 60 * 60 * 1000

/** Offers to reload when a new version is deployed, instead of reloading mid-game. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Installed apps can stay open for days: look for updates hourly
      if (registration) setInterval(() => void registration.update(), HOUR)
    },
  })

  if (!needRefresh) return null
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border-2 bg-card px-4 py-3 shadow-lg"
    >
      <span className="flex-1 text-sm">Доступна новая версия</span>
      <Button variant="ghost" size="sm" onClick={() => setNeedRefresh(false)}>
        Позже
      </Button>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        Обновить
      </Button>
    </div>
  )
}
