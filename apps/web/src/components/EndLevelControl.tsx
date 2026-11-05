import { DEFAULT_END_LEVEL, MAX_END_LEVEL, MIN_END_LEVEL, type Player } from '@munchkin/core'
import { cn } from 'cn'
import { Minus, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

const PRESETS = [DEFAULT_END_LEVEL, 15, 20, 30]

interface EndLevelControlProps {
  endLevel: number
  players: Player[]
  connected: boolean
  onChange: (level: number) => void
}

/** Lets the host change what level wins the game, for longer games with expansions. */
export function EndLevelControl({ endLevel, players, connected, onChange }: EndLevelControlProps) {
  const [open, setOpen] = useState(false)
  const label = `Игра до ${endLevel} уровня`

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        disabled={!connected}
        aria-label={`${label}, изменить`}
        className="mx-auto flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-bold text-muted-foreground transition-transform outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 disabled:opacity-50"
      >
        {label}
        <Pencil className="size-3.5" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent title="До какого уровня играем?" description="Кто первым дойдёт, тот и победил. Обычно до 10, с дополнениями часто играют дольше.">
        {/* Remounts on every open, so the draft starts from the current level */}
        <EndLevelForm
          endLevel={endLevel}
          minLevel={Math.max(MIN_END_LEVEL, ...players.map((p) => p.level))}
          onSave={(level) => {
            onChange(level)
            setOpen(false)
          }}
        />
      </SheetContent>
    </Sheet>
  )
}

interface EndLevelFormProps {
  endLevel: number
  minLevel: number
  onSave: (level: number) => void
}

function EndLevelForm({ endLevel, minLevel, onSave }: EndLevelFormProps) {
  const [level, setLevel] = useState(endLevel)
  const step = 'flex size-16 shrink-0 items-center justify-center rounded-[20px] transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 disabled:opacity-40'

  return (
    <>
      <div className="mt-5 flex items-center gap-2.5">
        <button type="button" aria-label="Меньше" disabled={level <= minLevel} onClick={() => setLevel(level - 1)} className={cn(step, 'bg-secondary')}>
          <Minus className="size-[18px]" strokeWidth={2.5} aria-hidden="true" />
        </button>
        <output aria-live="polite" className="flex h-16 min-w-0 flex-1 items-center justify-center rounded-[20px] border-2 border-border bg-background font-display text-[28px] font-extrabold tabular-nums">
          {level}
        </output>
        <button
          type="button"
          aria-label="Больше"
          disabled={level >= MAX_END_LEVEL}
          onClick={() => setLevel(level + 1)}
          className={cn(step, 'bg-cocoa text-primary-foreground')}
        >
          <Plus className="size-[18px]" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={preset < minLevel}
            aria-pressed={preset === level}
            onClick={() => setLevel(preset)}
            className={cn(
              'h-11 rounded-full border-2 text-[15px] font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40',
              preset === level ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
            )}
          >
            {preset}
          </button>
        ))}
      </div>

      {minLevel > MIN_END_LEVEL && <p className="mt-3 text-center text-[13px] text-muted-foreground">Ниже {minLevel} нельзя: кто-то уже на этом уровне</p>}

      <button
        type="button"
        onClick={() => onSave(level)}
        className="mt-5 h-14 w-full rounded-[18px] bg-primary font-display text-[15px] font-semibold text-primary-foreground transition-transform outline-none hover:bg-terracotta-deep focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]"
      >
        Сохранить
      </button>
    </>
  )
}
