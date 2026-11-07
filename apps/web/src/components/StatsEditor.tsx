import {
  CLASSES,
  classLabel,
  clampGearBonus,
  clampLevel,
  DEFAULT_END_LEVEL,
  GENDERS,
  getLabel,
  MAX_GEAR_BONUS,
  MIN_GEAR_BONUS,
  MIN_LEVEL,
  power,
  RACES,
  raceLabel,
  type Option,
  type Player,
  type PlayerStats,
} from '@munchkin/core'
import { cn } from 'cn'
import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckDot, Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Switch } from 'radix-ui'
import type { ReactNode } from 'react'
import { plural } from '@/lib/plural'

interface StatsEditorProps {
  player: Player
  isHost: boolean
  /** The level that wins the game */
  endLevel?: number
  onChange: (stats: Partial<PlayerStats>) => void
}

export function StatsEditor({ player, isHost, endLevel = DEFAULT_END_LEVEL, onChange }: StatsEditorProps) {
  const toWin = endLevel - player.level
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
              {raceLabel(player)} · {classLabel(player)}
            </p>
            {(player.halfBreed || player.superMunchkin) && (
              <p className="mt-2.5 flex flex-wrap gap-1.5">
                {player.halfBreed && <CardBadge>Полукровка</CardBadge>}
                {player.superMunchkin && <CardBadge>Суперманчкин</CardBadge>}
              </p>
            )}
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
          aria-valuemax={endLevel}
          aria-valuenow={player.level}
        >
          <div
            className="h-full rounded-full bg-mustard transition-[width] duration-500 ease-out"
            style={{ width: `${(player.level / endLevel) * 100}%` }}
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
          canIncrease={player.level < endLevel}
          onStep={(d) => onChange({ level: clampLevel(player.level + d, endLevel) })}
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
        <TraitSelect label="Пол" hint="Пол вашего персонажа" value={player.gender} options={GENDERS} onChange={(gender) => onChange({ gender })} />
        <DoubleTraitSheet
          label="Раса"
          hint="Карта расы, что сейчас перед вами"
          card="Полукровка"
          cardHint="две расы"
          options={RACES}
          first={player.race}
          second={player.race2 ?? ''}
          cardOn={!!player.halfBreed}
          onChange={(race, race2, halfBreed) => onChange({ race, race2, halfBreed })}
        />
        <DoubleTraitSheet
          label="Класс"
          hint="Нет карты класса — выберите «Без класса»"
          card="Суперманчкин"
          cardHint="два класса"
          options={CLASSES}
          first={player.class}
          second={player.class2 ?? ''}
          cardOn={!!player.superMunchkin}
          empty="none"
          onChange={(cls, class2, superMunchkin) => onChange({ class: cls, class2, superMunchkin })}
        />
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
  hint: string
  value: T
  options: readonly Option<T>[]
  onChange: (value: T) => void
}

function CardBadge({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-7 items-center rounded-full bg-mustard px-2.5 text-xs font-bold text-cocoa">{children}</span>
}

const pillClass =
  'h-12 w-full min-w-0 overflow-hidden rounded-full border-2 border-border bg-card px-1.5 font-bold transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95'

const tileClass = (checked: boolean) =>
  cn(
    'flex h-16 min-w-0 items-center justify-between gap-2 rounded-[20px] border-2 pr-4 pl-[18px] text-left text-[17px] font-bold transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]',
    checked ? 'border-primary bg-primary text-primary-foreground shadow-[0_6px_16px_rgba(180,70,31,0.3)]' : 'border-border bg-background',
  )

/** A pill showing the current trait; tapping it opens a sheet of large tiles. */
function TraitSelect<T extends string>({ label, hint, value, options, onChange }: TraitSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const current = getLabel(options, value)

  function choose(next: T) {
    if (next !== value) onChange(next)
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label={`${label}: ${current}`} className={cn(pillClass, 'truncate text-[15px]')}>
        {current}
      </SheetTrigger>
      <SheetContent title={label} description={hint}>
        <SingleTiles label={label} options={options} value={value} onChoose={choose} />
      </SheetContent>
    </Sheet>
  )
}

function SingleTiles<T extends string>({ label, options, value, onChoose }: { label: string; options: readonly Option<T>[]; value: T; onChoose: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-4 grid grid-cols-2 gap-2.5">
      {options.map((o) => {
        const checked = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={checked} onClick={() => onChoose(o.value)} className={tileClass(checked)}>
            <span className="truncate">{o.label}</span>
            <CheckDot checked={checked} tone="mustard" />
          </button>
        )
      })}
    </div>
  )
}

interface DoubleTraitSheetProps<T extends string> {
  label: string
  hint: string
  /** The card that allows a second choice */
  card: string
  cardHint: string
  options: readonly Option<T>[]
  first: T
  second: T | ''
  cardOn: boolean
  /** The "nothing" option, which can't be combined with another one */
  empty?: T
  onChange: (first: T, second: T | '', cardOn: boolean) => void
}

/** Like TraitSelect, with a switch for the card that allows a second race or class. */
function DoubleTraitSheet<T extends string>({ label, hint, card, cardHint, options, first, second, cardOn, empty, onChange }: DoubleTraitSheetProps<T>) {
  const [open, setOpen] = useState(false)
  const names = [first, second].filter(Boolean).map((v) => getLabel(options, v))

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label={`${label}: ${names.join(' + ')}`} className={pillClass}>
        {names.length === 1 ? (
          <span className="block truncate text-[15px]">{names[0]}</span>
        ) : (
          <span className="block truncate text-[13px] leading-4">
            {names[0]}
            <br />+ {names[1]}
          </span>
        )}
      </SheetTrigger>
      <SheetContent title={label} description={hint}>
        {/* Inside the content, so its draft is thrown away on close and every open starts from what is saved */}
        <DoubleTraitForm {...{ label, card, cardHint, options, first, second, cardOn, empty, onChange }} onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

function DoubleTraitForm<T extends string>({
  label,
  card,
  cardHint,
  options,
  first,
  second,
  cardOn,
  empty,
  onChange,
  onClose,
}: Omit<DoubleTraitSheetProps<T>, 'hint'> & { onClose: () => void }) {
  const [on, setOn] = useState(cardOn)
  const [picked, setPicked] = useState<readonly T[]>(second ? [first, second] : [first])
  const real = picked.filter((v) => v !== empty)
  const full = on && real.length === 2
  const feminine = label === 'Раса'

  function save(nextFirst: T, nextSecond: T | '', nextOn: boolean) {
    if (nextFirst !== first || nextSecond !== second || nextOn !== cardOn) onChange(nextFirst, nextSecond, nextOn)
    onClose()
  }

  function toggleCard(next: boolean) {
    setOn(next)
    setPicked([picked[0]!])
  }

  function pick(value: T) {
    if (!on) return save(value, '', false)
    if (value === empty) return setPicked([value])
    if (picked.includes(value)) {
      const rest = picked.filter((v) => v !== value)
      // A race can't be empty; a class falls back to "no class"
      if (rest.length > 0) setPicked(rest)
      else if (empty) setPicked([empty])
      return
    }
    if (!full) setPicked([...real, value])
  }

  const status = !on
    ? 'Выбор сразу сохранится'
    : full
      ? `Выбрано 2 из 2. ${feminine ? 'Снимите одну, чтобы взять другую' : 'Снимите один, чтобы взять другой'}`
      : real.length === 1
        ? `${feminine ? 'Выбрана 1 из 2, можно оставить и одну' : 'Выбран 1 из 2, можно оставить и один'}`
        : 'Можно выбрать два'

  // Both modes share one layout: the sheet is pinned to the bottom, so any
  // change of its height would make every tile jump when the switch is flipped.
  return (
    <>
      <div className={cn('mt-3.5 flex items-center gap-3 rounded-[20px] border-2 py-2.5 pr-3 pl-4 transition-colors', on ? 'border-primary bg-[#fff1e6]' : 'border-border bg-background')}>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold">{card}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Есть такая карта? Можно {cardHint}</p>
        </div>
        <Switch.Root
          checked={on}
          onCheckedChange={toggleCard}
          aria-label={card}
          className={cn(
            'relative h-8 w-14 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            on ? 'bg-primary' : 'bg-[#a0806f]',
          )}
        >
          <Switch.Thumb className={cn('block size-[26px] translate-x-[3px] rounded-full bg-card transition-transform', on && 'translate-x-[27px]')} />
        </Switch.Root>
      </div>

      <div role={on ? 'group' : 'radiogroup'} aria-label={label} className="mt-3 grid grid-cols-2 gap-2">
        {options.map((o) => {
          const checked = picked.includes(o.value)
          const locked = !checked && full && o.value !== empty
          return (
            <button
              key={o.value}
              type="button"
              role={on ? 'checkbox' : 'radio'}
              aria-checked={checked}
              disabled={locked}
              onClick={() => pick(o.value)}
              className={cn(
                tileClass(checked),
                'h-[60px] pr-2.5 pl-3.5 text-[15px]',
                locked && 'border-dashed bg-transparent text-muted-foreground',
                // An odd count would leave a hole in the grid: "no class" takes the whole first row
                o.value === empty && options.length % 2 === 1 && 'col-span-2',
              )}
            >
              <span className="truncate">{o.label}</span>
              <span className={cn('flex', locked && 'opacity-40')}>
                <CheckDot checked={checked} tone="mustard" />
              </span>
            </button>
          )
        })}
      </div>

      <p role="status" className="mt-3 text-center text-[13px] leading-[18px] text-muted-foreground">
        {status}
      </p>

      <button
        type="button"
        onClick={() => save(picked[0]!, on ? (picked[1] ?? '') : '', on)}
        className="mt-3 h-14 w-full rounded-[18px] bg-primary font-display text-[15px] font-semibold text-primary-foreground transition-transform outline-none hover:bg-terracotta-deep focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]"
      >
        Готово
      </button>
    </>
  )
}
