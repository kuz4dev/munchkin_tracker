import { Download, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isIosSafari, isStandalone, promptInstall, useCanInstall } from './install'

/** Invites the user to add the app to the home screen (shown on the home page). */
export function InstallHint() {
  const canInstall = useCanInstall()
  if (isStandalone()) return null

  if (canInstall) {
    return (
      <Button variant="ghost" className="h-11 px-0 text-[15px] font-bold text-primary hover:bg-transparent hover:text-terracotta-deep" onClick={() => void promptInstall()}>
        <Download aria-hidden="true" />
        Установить на телефон
      </Button>
    )
  }
  if (isIosSafari()) {
    return (
      <p className="flex items-center gap-1 text-sm text-muted-foreground">
        Чтобы установить: <Share className="size-3.5" aria-label="Поделиться" /> → «На экран „Домой“»
      </p>
    )
  }
  return null
}
