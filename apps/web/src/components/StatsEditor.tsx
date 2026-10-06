import {
  CLASSES,
  clampGearBonus,
  clampLevel,
  GENDERS,
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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

interface StatsEditorProps {
  player: Player
  isHost: boolean
  onChange: (stats: Partial<PlayerStats>) => void
}

export function StatsEditor({ player, isHost, onChange }: StatsEditorProps) {
  return (
    <Card className="gap-0 overflow-hidden border-2 border-primary/50 py-0 shadow-md">
      <div className="bg-primary/5 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              Ваш персонаж{isHost && ' · хост'}
            </p>
            <h2 className="truncate text-lg font-bold text-foreground sm:text-xl">{player.name}</h2>
          </div>
          <div className="ml-3 flex shrink-0 flex-col items-center rounded-2xl bg-primary px-4 py-2 text-primary-foreground shadow-sm sm:px-5 sm:py-3">
            <span className="text-3xl leading-none font-extrabold sm:text-4xl" aria-label={`Сила ${power(player)}`}>
              {power(player)}
            </span>
            <span className="mt-0.5 text-[10px] font-medium opacity-80 sm:text-xs" aria-hidden="true">
              СИЛА
            </span>
          </div>
        </div>
      </div>

      <CardContent className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
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

        <Separator />

        <div className="flex flex-wrap gap-1.5">
          <TraitSelect label="Пол" value={player.gender} options={GENDERS} onChange={(gender) => onChange({ gender })} />
          <TraitSelect label="Раса" value={player.race} options={RACES} onChange={(race) => onChange({ race })} />
          <TraitSelect label="Класс" value={player.class} options={CLASSES} onChange={(cls) => onChange({ class: cls })} />
        </div>
      </CardContent>
    </Card>
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
  const buttonClass =
    'size-10 shrink-0 rounded-xl text-lg font-bold transition-transform active:scale-90 sm:size-11'
  return (
    <div className="rounded-xl bg-secondary/50 p-3 sm:p-4" role="group" aria-label={label}>
      <span className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</span>
      <div className="mt-2 flex items-center justify-between">
        <Button variant="outline" className={buttonClass} disabled={!canDecrease} onClick={() => onStep(-1)} aria-label={`${label}: меньше`}>
          −
        </Button>
        <span className="text-2xl font-extrabold text-foreground tabular-nums sm:text-3xl" aria-live="polite">
          {value}
        </span>
        <Button variant="outline" className={buttonClass} disabled={!canIncrease} onClick={() => onStep(1)} aria-label={`${label}: больше`}>
          +
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
  const id = `trait-${label}`
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground sm:text-sm">
        {label}
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} className="data-[size=default]:h-11">
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
    </div>
  )
}
