import { FLEE_MIN_ROLL, fleeSucceeded, selectConnected } from '@munchkin/core'
import { cn } from 'cn'
import { Footprints, Skull } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Die } from '@/components/art'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { gameActions, useGame } from '@/game/store'

/** The die tumbles at least this long, even if the server answers sooner. */
export const MIN_ROLL_MS = 900

const button =
  'h-14 w-full rounded-[18px] font-display text-[15px] font-semibold transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98] disabled:opacity-50'

interface FleeActionsProps {
  onDie: () => void
  onCloseCombat: () => void
}

/** "Flee" and "die" under a lost fight. The server rolls: the result comes back in the journal. */
export function FleeActions({ onDie, onCloseCombat }: FleeActionsProps) {
  const playerId = useGame((s) => s.playerId)
  const connected = useGame(selectConnected)
  const changelog = useGame((s) => s.changelog)
  // Journal position when the die was thrown; null while the result sheet is closed
  const [thrownAfter, setThrownAfter] = useState<number | null>(null)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (thrownAfter === null) return
    const t = setTimeout(() => setSettled(true), MIN_ROLL_MS)
    return () => clearTimeout(t)
  }, [thrownAfter])

  const result =
    thrownAfter === null
      ? undefined
      : changelog.filter((e) => e.eventType === 'flee' && e.playerId === playerId && e.seq > thrownAfter).at(-1)
  const roll = result && settled ? Number(result.newValue) : null
  const escaped = roll !== null && fleeSucceeded(roll)

  function flee() {
    setSettled(false)
    setThrownAfter(changelog.at(-1)?.seq ?? 0)
    gameActions().flee()
  }

  return (
    <div className="mt-4">
      <button type="button" disabled={!connected} onClick={flee} className={cn(button, 'flex items-center justify-center gap-2.5 bg-mustard text-cocoa')}>
        <Footprints className="size-5" aria-hidden="true" />
        Смыться
      </button>
      <button
        type="button"
        onClick={onDie}
        className="mt-1.5 flex h-[50px] w-full items-center justify-center gap-2 rounded-[18px] text-[15px] font-bold text-lose outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Skull className="size-[18px]" aria-hidden="true" />
        Погибнуть
      </button>

      <Sheet open={thrownAfter !== null} onOpenChange={(open) => !open && setThrownAfter(null)}>
        <SheetContent title="Смывка" hideTitle>
          <div className="flex flex-col items-center text-center" role="status">
            <Die face={roll ?? 1} rolling={roll === null} className="size-32" />
            {roll === null ? (
              <p className="mt-6 font-display text-[26px] leading-tight font-extrabold">Бросаем…</p>
            ) : escaped ? (
              <>
                <p className="mt-6 font-display text-[26px] leading-tight font-extrabold text-win">Смылись!</p>
                <p className="mt-2 text-base text-muted-foreground">Выпало {roll}. Монстр остался ни с чем, вы тоже</p>
              </>
            ) : (
              <>
                <p className="mt-6 font-display text-[26px] leading-tight font-extrabold">Не вышло</p>
                <p className="mt-2 text-base text-muted-foreground">
                  Выпало {roll}, а нужно {FLEE_MIN_ROLL} или 6. Монстр вас догнал
                </p>
              </>
            )}
          </div>

          {/* Kept in the layout while rolling, so the sheet doesn't jump when the result lands */}
          <div className={cn('mt-6 flex flex-col gap-2.5', roll === null && 'invisible')}>
            {escaped ? (
              <button type="button" onClick={onCloseCombat} className={cn(button, 'bg-win text-primary-foreground')}>
                Закрыть бой
              </button>
            ) : (
              <button type="button" onClick={onDie} className={cn(button, 'flex items-center justify-center gap-2.5 bg-cocoa text-primary-foreground')}>
                <Skull className="size-5" aria-hidden="true" />
                Погибнуть
              </button>
            )}
            <button
              type="button"
              disabled={!connected}
              onClick={flee}
              className="h-[52px] w-full rounded-[18px] bg-secondary text-[15px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              Бросить ещё раз
            </button>
            <p className="text-center text-[13px] text-muted-foreground">Ещё раз — если монстров было несколько</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
