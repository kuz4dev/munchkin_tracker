import { CircleCheck, Download, Share } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/metrics'
import { canAddToHomeScreenOnIos, isStandalone, promptInstall, useCanInstall, useInstalled } from './install'

const noteClass = 'text-sm leading-snug text-muted-foreground'
const INSTALLED_TOAST_MS = 4000

/** Invites the user to add the app to the home screen (shown on the home page). */
export function InstallHint() {
  const canInstall = useCanInstall()
  const installed = useInstalled()
  const [outcome, setOutcome] = useState<'accepted' | 'dismissed' | null>(null)
  const [toastDone, setToastDone] = useState(false)

  useEffect(() => {
    if (!installed) return
    const t = setTimeout(() => setToastDone(true), INSTALLED_TOAST_MS)
    return () => clearTimeout(t)
  }, [installed])

  async function install() {
    track('install_click')
    const accepted = await promptInstall()
    if (accepted) track('install_accepted')
    setOutcome(accepted ? 'accepted' : 'dismissed')
  }

  if (isStandalone()) return null

  if (installed) {
    if (toastDone) return null
    return (
      <div className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-lg">
        <div
          role="status"
          className="flex animate-in items-center gap-3 rounded-[20px] bg-cocoa px-4 py-3 text-primary-foreground shadow-[0_10px_24px_rgba(58,36,32,0.25)] duration-300 fade-in slide-in-from-bottom-2"
        >
          <CircleCheck className="size-6 shrink-0 text-mustard" aria-hidden="true" />
          <span className="min-w-0 text-sm font-bold">Готово! Ищите «Манчкин» среди приложений на телефоне</span>
        </div>
      </div>
    )
  }
  if (outcome === 'accepted') {
    return (
      <p role="status" className={noteClass}>
        Устанавливается… Иконка «Манчкин» появится среди приложений примерно через полминуты. Если её нет, выключите VPN и попробуйте снова.
      </p>
    )
  }
  // After a refusal the browser may offer the install again: then the button returns
  if (canInstall) {
    return (
      <Button variant="ghost" className="h-11 px-0 text-[15px] font-bold text-primary hover:bg-transparent hover:text-terracotta-deep" onClick={() => void install()}>
        <Download aria-hidden="true" />
        Установить на телефон
      </Button>
    )
  }
  if (outcome === 'dismissed') {
    return (
      <p role="status" className={noteClass}>
        Установка отменена. Установить можно из меню браузера: ⋮ → «Установить приложение».
      </p>
    )
  }
  if (canAddToHomeScreenOnIos()) {
    return (
      <p className="flex items-center gap-1 text-sm text-muted-foreground">
        Чтобы установить: <Share className="size-3.5" aria-label="Поделиться" /> → «На экран „Домой“»
      </p>
    )
  }
  return null
}
