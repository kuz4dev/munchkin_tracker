import { Download, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isIosSafari, isStandalone, promptInstall, useCanInstall } from './install'

/** Invites the user to add the app to the home screen (shown on the home page). */
export function InstallHint() {
  const canInstall = useCanInstall()
  if (isStandalone()) return null

  if (canInstall) {
    return (
      <Button variant="ghost" className="mt-4 text-muted-foreground" onClick={() => void promptInstall()}>
        <Download aria-hidden="true" />
        Установить приложение
      </Button>
    )
  }
  if (isIosSafari()) {
    return (
      <p className="mt-4 flex max-w-xs items-center justify-center gap-1 text-center text-xs text-muted-foreground">
        Чтобы установить: <Share className="size-3.5" aria-label="Поделиться" /> → «На экран „Домой“»
      </p>
    )
  }
  return null
}
