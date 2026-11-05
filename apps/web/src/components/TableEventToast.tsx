import { describeGroup, groupChangelog, type ChangeLogEntry } from '@munchkin/core'
import { Crown, Dices, Skull } from 'lucide-react'
import { useEffect, useState } from 'react'

const SHOW_MS = 4000
/** Events this long before the screen opened are history that came with the join, not news. */
const NEWS_MS = 15_000

/** Tells the table when someone else rolled to flee or died, or the host changed. */
export function TableEventToast({ entries, playerId }: { entries: ChangeLogEntry[]; playerId: string }) {
  // Everyone hears about a new host, the new host included; the rest is news only for others
  const news = entries
    .filter((e) => e.eventType === 'host_change' || ((e.eventType === 'flee' || e.eventType === 'die') && e.playerId !== playerId))
    .at(-1)
  const newsSeq = news?.seq
  const [expiredSeq, setExpiredSeq] = useState(0)
  const [openedAt] = useState(() => Date.now())

  useEffect(() => {
    if (newsSeq === undefined) return
    const t = setTimeout(() => setExpiredSeq(newsSeq), SHOW_MS)
    return () => clearTimeout(t)
  }, [newsSeq])

  const shown = news && news.seq > expiredSeq && news.timestamp > openedAt - NEWS_MS ? news : null
  if (!shown) return null
  return (
    <div className="pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top)+76px)] z-40 mx-auto max-w-lg">
      <div
        role="status"
        key={shown.seq}
        className="flex animate-in items-center gap-3 rounded-[20px] bg-cocoa px-4 py-3 text-primary-foreground shadow-[0_10px_24px_rgba(58,36,32,0.25)] duration-300 fade-in slide-in-from-top-2"
      >
        {shown.eventType === 'flee' ? (
          <Dices className="size-6 shrink-0 text-mustard" aria-hidden="true" />
        ) : shown.eventType === 'host_change' ? (
          <Crown className="size-6 shrink-0 text-mustard" aria-hidden="true" />
        ) : (
          <Skull className="size-6 shrink-0 text-mustard" aria-hidden="true" />
        )}
        <span className="min-w-0 text-sm font-bold">{describeGroup(groupChangelog([shown])[0]!)}</span>
      </div>
    </div>
  )
}
