import { Moon } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Answers from an awake server come well before this, so only a cold start shows the hint. */
export const WAKE_HINT_DELAY = 4000

/**
 * The free server sleeps when nobody plays and takes up to a minute to wake.
 * Explains the wait, so it doesn't look like the app hung.
 */
export function ServerWakeHint({ active }: { active: boolean }) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setSlow(true), WAKE_HINT_DELAY)
    return () => {
      clearTimeout(t)
      setSlow(false)
    }
  }, [active])

  if (!active || !slow) return null
  return (
    <div
      role="status"
      className="flex animate-in items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-left duration-300 fade-in slide-in-from-bottom-1"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-mustard text-cocoa" aria-hidden="true">
        <Moon className="size-5 animate-pulse" />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-bold">Будим сервер…</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">Он засыпает, когда никто не играет. Это займёт до минуты</p>
      </div>
    </div>
  )
}
