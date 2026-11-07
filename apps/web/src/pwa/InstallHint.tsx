import { CircleCheck, Download, Share } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/metrics'
import { canAddToHomeScreenOnIos, isStandalone, promptInstall, useCanInstall, useInstalled } from './install'

const noteClass = 'text-sm leading-snug text-muted-foreground'

/** Invites the user to add the app to the home screen (shown on the home page). */
export function InstallHint() {
  const canInstall = useCanInstall()
  const installed = useInstalled()
  const [outcome, setOutcome] = useState<'accepted' | 'dismissed' | null>(null)

  async function install() {
    track('install_click')
    const accepted = await promptInstall()
    if (accepted) track('install_accepted')
    setOutcome(accepted ? 'accepted' : 'dismissed')
  }

  if (isStandalone()) return null

  if (installed) {
    return (
      <p role="status" className="flex items-start gap-2 text-sm leading-snug font-semibold text-online">
        <CircleCheck className="size-[18px] shrink-0" aria-hidden="true" />
        Готово! Ищите «Манчкин» среди приложений на телефоне
      </p>
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
