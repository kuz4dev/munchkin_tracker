import { Check, Copy, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SwordMark } from '@/components/art'
import { track } from '@/lib/metrics'
import { copyText, inviteLink } from '@/lib/share'

interface RoomHeaderProps {
  code: string
  connected: boolean
  onLeave: () => void
}

export function RoomHeader({ code, connected, onLeave }: RoomHeaderProps) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 2500)
    return () => clearTimeout(t)
  }, [copied])

  async function copyInvite() {
    const ok = await copyText(inviteLink(code))
    if (ok) track('invite')
    setCopied(ok ? 'ok' : 'failed')
  }

  return (
    <header className="sticky top-0 z-50 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="mx-auto flex h-[70px] max-w-4xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <SwordMark className="hidden size-8 shrink-0 sm:block" />
          <button
            type="button"
            onClick={copyInvite}
            aria-label={`Скопировать ссылку на комнату ${code}`}
            className="flex h-[42px] items-center gap-2 rounded-full bg-cocoa px-3.5 font-display text-sm font-semibold tracking-[2px] text-primary-foreground transition-transform active:scale-95"
          >
            {code}
            {copied === 'ok' ? (
              <Check className="size-4 shrink-0 text-mustard" aria-hidden="true" />
            ) : (
              <Copy className="size-4 shrink-0 text-mustard" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <span className={`flex items-center gap-1.5 text-[13px] font-bold ${connected ? 'text-online' : 'text-destructive'}`}>
            <span className={`size-2 rounded-full ${connected ? 'bg-online' : 'bg-destructive'}`} aria-hidden="true" />
            {connected ? 'Онлайн' : 'Оффлайн'}
          </span>
          <button
            type="button"
            onClick={onLeave}
            aria-label="Выйти из комнаты"
            className="flex size-11 items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground transition-colors hover:text-destructive"
          >
            <LogOut className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>
      {copied && (
        <p role="status" className="pb-2 text-center text-[13px] font-semibold text-muted-foreground">
          {copied === 'ok' ? 'Ссылка на комнату скопирована' : `Не удалось скопировать. Код комнаты: ${code}`}
        </p>
      )}
    </header>
  )
}
