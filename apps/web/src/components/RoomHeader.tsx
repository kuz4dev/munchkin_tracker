import { Check, Copy, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

interface RoomHeaderProps {
  code: string
  connected: boolean
  onLeave: () => void
}

export function RoomHeader({ code, connected, onLeave }: RoomHeaderProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Clipboard unavailable (insecure context, denied): the code is on screen anyway
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b-2 border-border/60 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="mx-auto max-w-4xl px-3 sm:px-4">
        <div className="flex h-14 items-center justify-between sm:h-16">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="shrink-0 text-lg select-none sm:text-xl" aria-hidden="true">
              🗡️
            </span>
            <h1 className="hidden truncate text-base font-bold sm:block sm:text-lg">Манчкин</h1>
            <button
              type="button"
              onClick={copyCode}
              aria-label={`Скопировать код комнаты ${code}`}
              className="flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5 transition-colors hover:bg-accent active:scale-95"
            >
              <span className="font-mono text-sm font-bold tracking-wider text-foreground sm:text-base">{code}</span>
              {copied ? (
                <Check className="size-4 shrink-0 text-game-green" aria-hidden="true" />
              ) : (
                <Copy className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className={`flex items-center gap-1.5 ${connected ? 'text-game-green' : 'text-destructive'}`}>
              <span
                className={`size-2 shrink-0 rounded-full ${connected ? 'animate-pulse bg-game-green' : 'bg-destructive'}`}
                aria-hidden="true"
              />
              <span className="sr-only text-xs font-medium sm:not-sr-only sm:text-sm">
                {connected ? 'Онлайн' : 'Оффлайн'}
              </span>
            </div>
            <Button
              variant="ghost"
              className="h-9 px-2.5 text-muted-foreground hover:text-destructive sm:px-3"
              onClick={onLeave}
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden text-sm sm:inline">Выйти</span>
              <span className="sr-only sm:hidden">Выйти</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
