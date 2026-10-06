import {
  CLASSES,
  clampGearBonus,
  clampLevel,
  GENDERS,
  getLabel,
  MAX_GEAR_BONUS,
  MAX_LEVEL,
  MIN_GEAR_BONUS,
  MIN_LEVEL,
  power,
  RACES,
  type Option,
  type Player,
  type PlayerStats,
} from '@munchkin/core'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { plural } from '@/lib/plural'

interface StatsEditorProps {
  player: Player
  isHost: boolean
  onChange: (stats: Partial<PlayerStats>) => void
}

export function StatsEditor({ player, isHost, onChange }: StatsEditorProps) {
  const toWin = MAX_LEVEL - player.level
  return (
    <div className="flex flex-col gap-3.5">
      <section className="relative overflow-hidden rounded-[28px] bg-primary p-5 text-primary-foreground">
        <svg viewBox="0 0 180 180" className="pointer-events-none absolute -top-10 -right-10 size-[180px]" aria-hidden="true">
          <circle cx="90" cy="90" r="90" fill="var(--terracotta-soft)" />
          <circle cx="90" cy="90" r="55" fill="#d06a3c" />
        </svg>
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold">Ваш персонаж{isHost && ' · хост'}</p>
            <h2 className="mt-1.5 truncate font-display text-[28px] leading-tight font-extrabold">{player.name}</h2>
            <p className="mt-1 text-sm">
              {getLabel(RACES, player.race)} · {getLabel(CLASSES, player.class)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p
              key={power(player)}
              className="animate-in font-display text-[64px] leading-[0.9] font-extrabold tabular-nums duration-300 fade-in slide-in-from-bottom-2"
              aria-label={`Сила ${power(player)}`}
            >
              {power(player)}
            </p>
            <p className="mt-1 text-xs font-bold tracking-[3px]" aria-hidden="true">
              СИЛА
            </p>
          </div>
        </div>
        <div
          className="relative mt-[18px] h-3 overflow-hidden rounded-full bg-terracotta-deep"
          role="progressbar"
          aria-label="Уровень"
          aria-valuemin={MIN_LEVEL}
          aria-valuemax={MAX_LEVEL}
          aria-valuenow={player.level}
        >
          <div
            className="h-full rounded-full bg-mustard transition-[width] duration-500 ease-out"
            style={{ width: `${(player.level / MAX_LEVEL) * 100}%` }}
          />
        </div>
        <p className="relative mt-2 text-[13px]">
          {toWin > 0 ? `До победы ${toWin} ${plural(toWin, ['уровень', 'уровня', 'уровней'])}` : 'Последний уровень!'}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Stepper
          label="Уровень"
          value={player.level}
          canDecrease={player.level > MIN_LEVEL}
          canIncrease={player.level < MAX_LEVEL}
          onStep={(d) => onChange({ level: clampLevel(player.level + d) })}
        />
        <Stepper
          label="Бонусы"
          value={player.gearBonus}
          canDecrease={player.gearBonus > MIN_GEAR_BONUS}
          canIncrease={player.gearBonus < MAX_GEAR_BONUS}
          onStep={(d) => onChange({ gearBonus: clampGearBonus(player.gearBonus + d) })}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <TraitSelect label="Пол" value={player.gender} options={GENDERS} onChange={(gender) => onChange({ gender })} />
        <TraitSelect label="Раса" value={player.race} options={RACES} onChange={(race) => onChange({ race })} />
        <TraitSelect label="Класс" value={player.class} options={CLASSES} onChange={(cls) => onChange({ class: cls })} />
      </div>
    </div>
  )
}

interface StepperProps {
  label: string
  value: number
  canDecrease: boolean
  canIncrease: boolean
  onStep: (delta: 1 | -1) => void
}

function Stepper({ label, value, canDecrease, canIncrease, onStep }: StepperProps) {
  return (
    <div className="rounded-[22px] border-2 border-border bg-card p-3.5" role="group" aria-label={label}>
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
      <p
        key={value}
        className="mt-1.5 animate-in font-display text-[44px] leading-none font-extrabold tabular-nums duration-300 fade-in slide-in-from-bottom-2"
        aria-live="polite"
      >
        {value}
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          className="h-11 flex-1 rounded-[14px] transition-transform active:scale-95"
          disabled={!canDecrease}
          onClick={() => onStep(-1)}
          aria-label={`${label}: меньше`}
        >
          <Minus className="size-[18px]" strokeWidth={2.5} aria-hidden="true" />
        </Button>
        <Button
          className="h-11 flex-1 rounded-[14px] bg-cocoa text-primary-foreground transition-transform hover:bg-cocoa/90 active:scale-95"
          disabled={!canIncrease}
          onClick={() => onStep(1)}
          aria-label={`${label}: больше`}
        >
          <Plus className="size-[18px]" strokeWidth={2.5} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

interface TraitSelectProps<T extends string> {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}

function TraitSelect<T extends string>({ label, value, options, onChange }: TraitSelectProps<T>) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger
        aria-label={label}
        className="w-full min-w-0 justify-center rounded-full border-2 border-border bg-card px-2 text-[15px] font-bold data-[size=default]:h-11 [&_svg]:hidden"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
