import { describeEntry, describeGroup, formatTime, groupChangelog, type ChangeLogEntry } from '@munchkin/core'
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { plural } from '@/lib/plural'

interface ChangeLogProps {
  entries: ChangeLogEntry[]
  hasOlder: boolean
  loadingOlder: boolean
  onLoadOlder: () => Promise<void>
}

export function ChangeLog({ entries, hasOlder, loadingOlder, onLoadOlder }: ChangeLogProps) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  const [loadError, setLoadError] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Height before prepending history, to keep the visible entries in place
  const heightBeforeLoad = useRef<number | null>(null)

  const groups = useMemo(() => groupChangelog(entries), [entries])
  const lastSeq = entries[entries.length - 1]?.seq

  // Follow new events (not prepended history) while the panel is open
  useEffect(() => {
    const el = scrollRef.current
    if (open && el && heightBeforeLoad.current === null) el.scrollTop = el.scrollHeight
  }, [lastSeq, open])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && heightBeforeLoad.current !== null) {
      el.scrollTop += el.scrollHeight - heightBeforeLoad.current
      heightBeforeLoad.current = null
    }
  }, [entries])

  async function loadOlder() {
    setLoadError(false)
    heightBeforeLoad.current = scrollRef.current?.scrollHeight ?? 0
    try {
      await onLoadOlder()
    } catch {
      heightBeforeLoad.current = null
      setLoadError(true)
    }
  }

  function toggle(key: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="overflow-hidden rounded-[18px] bg-secondary">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex h-[54px] w-full items-center justify-between gap-3 px-[18px] text-[15px] font-bold">
          <span className="flex items-center gap-2.5">
            <ScrollText className="size-[18px] text-primary" aria-hidden="true" />
            Журнал партии
          </span>
          <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            {entries.length > 0 && `${entries.length} ${plural(entries.length, ['событие', 'события', 'событий'])}`}
            <ChevronDown className={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {groups.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Пока нет событий</p>
          ) : (
            <div ref={scrollRef} className="max-h-72 space-y-0.5 overflow-y-auto border-t-2 border-background/60 px-[18px] py-2">
              {hasOlder && (
                <div className="py-1 text-center">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                    disabled={loadingOlder}
                    onClick={loadOlder}
                  >
                    {loadingOlder ? 'Загрузка…' : loadError ? 'Не удалось загрузить, повторить' : 'Показать более ранние'}
                  </button>
                </div>
              )}
              {groups.map((group) => {
                const multi = group.entries.length > 1
                const isOpen = expanded.has(group.key)
                return (
                  <div key={group.key}>
                    <div className="flex items-start gap-2 py-1 text-sm">
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">
                        {formatTime(group.timestamp)}
                      </span>
                      {multi ? (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          className="flex items-center gap-1.5 text-left text-foreground transition-colors hover:text-primary"
                          onClick={() => toggle(group.key)}
                        >
                          <ChevronRight
                            className={`size-3 shrink-0 text-muted-foreground transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                            aria-hidden="true"
                          />
                          <span>{describeGroup(group)}</span>
                          <span className="text-xs text-muted-foreground">({group.entries.length} изм.)</span>
                        </button>
                      ) : (
                        <span className="text-foreground">{describeGroup(group)}</span>
                      )}
                    </div>
                    {multi && isOpen && (
                      <div className="ml-[4.5rem] space-y-0.5 border-l-2 border-secondary pb-1 pl-3">
                        {group.entries.map((entry) => (
                          <div key={entry.seq} className="flex items-start gap-2 py-0.5 text-xs text-muted-foreground">
                            <span className="shrink-0 font-mono">{formatTime(entry.timestamp)}</span>
                            <span>{describeEntry(entry)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
