import { formatBonus, power, resolveCombat, type Player } from '@munchkin/core'
import { cn } from 'cn'
import { Handshake, Minus, Plus, Skull, Trophy } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useId, useState, type ReactNode } from 'react'

const NO_ALLY = '__none__'

interface CombatModeProps {
  players: Player[]
  /** Who fights by default, usually the current player */
  defaultPlayerId?: string
}

/** Combat calculator. Lives inside a sheet, so its state resets on close. */
export function CombatMode({ players, defaultPlayerId = '' }: CombatModeProps) {
  const [playerId, setPlayerId] = useState(defaultPlayerId)
  const [allyId, setAllyId] = useState(NO_ALLY)
  const [monsterInput, setMonsterInput] = useState('')
  const [playerCards, setPlayerCards] = useState(0)
  const [monsterCards, setMonsterCards] = useState(0)

  // A chosen player may leave mid-fight: treat them as unselected
  const player = players.find((p) => p.id === playerId)
  const ally = player ? players.find((p) => p.id === allyId && p.id !== player.id) : undefined
  const monsterPower = Number.parseInt(monsterInput, 10)
  const outcome =
    player && !Number.isNaN(monsterPower)
      ? resolveCombat({ player, ally, playerCardBonus: playerCards, monsterPower, monsterCardBonus: monsterCards })
      : null
  const side = player ? (ally ? `${player.name} + ${ally.name}` : player.name) : ''

  function choosePlayer(id: string) {
    setPlayerId(id)
    if (allyId === id) setAllyId(NO_ALLY)
  }

  function stepMonster(delta: 1 | -1) {
    const current = Number.isNaN(monsterPower) ? 0 : monsterPower
    setMonsterInput(String(Math.max(1, current + delta)))
  }

  return (
    <div>
      <Field label="Кто сражается">
        {(labelId) => (
          <ChipGroup labelledBy={labelId} value={player ? playerId : ''} onChange={choosePlayer}>
            {players.map((p) => (
              <PlayerChip key={p.id} player={p} checked={p.id === playerId} />
            ))}
          </ChipGroup>
        )}
      </Field>

      {player && (
        <>
          <Field
            label={
              <>
                Союзник <span className="font-medium text-muted-foreground">· необязательно</span>
              </>
            }
          >
            {(labelId) => (
              <ChipGroup labelledBy={labelId} value={ally ? allyId : NO_ALLY} onChange={setAllyId}>
                <RadioGroup.Item
                  value={NO_ALLY}
                  className={cn(
                    chipClass,
                    'px-4 text-[15px] font-bold',
                    ally ? 'border-dashed border-border text-muted-foreground' : 'border-primary bg-primary text-primary-foreground',
                  )}
                >
                  Без союзника
                </RadioGroup.Item>
                {players
                  .filter((p) => p.id !== player.id)
                  .map((p) => (
                    <PlayerChip key={p.id} player={p} checked={p.id === ally?.id} />
                  ))}
              </ChipGroup>
            )}
          </Field>

          <Field label="Сила противника" htmlFor="combat-monster">
            {() => (
              <div className="flex items-center gap-2.5">
                <StepButton size="lg" label="Сила противника: меньше" onClick={() => stepMonster(-1)} disabled={!(monsterPower > 1)}>
                  <Minus />
                </StepButton>
                <input
                  id="combat-monster"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="0"
                  value={monsterInput}
                  onChange={(e) => setMonsterInput(e.target.value)}
                  className="h-16 w-full min-w-0 flex-1 [appearance:textfield] rounded-[20px] border-2 border-border bg-background text-center font-display text-[28px] font-extrabold tabular-nums outline-none placeholder:text-muted-foreground/40 focus-visible:border-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <StepButton size="lg" dark label="Сила противника: больше" onClick={() => stepMonster(1)}>
                  <Plus />
                </StepButton>
              </div>
            )}
          </Field>

          <Field label="Разовые карты">
            {() => (
              <div className="flex flex-col gap-2">
                <BonusRow label={side} value={playerCards} onChange={setPlayerCards} />
                <BonusRow label="Противник" value={monsterCards} onChange={setMonsterCards} />
              </div>
            )}
          </Field>
        </>
      )}

      {outcome && (
        <>
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <PowerBox label={side} total={outcome.playerTotal} base={outcome.playerBase} cards={playerCards} />
            <span className="flex size-10 items-center justify-center rounded-full bg-mustard font-display text-xs font-extrabold text-cocoa">
              VS
            </span>
            <PowerBox label="Противник" total={outcome.monsterTotal} base={monsterPower} cards={monsterCards} dark />
          </div>

          <div
            role="status"
            key={outcome.result}
            className={cn(
              'mt-3 flex animate-in items-center gap-3.5 rounded-[22px] border-2 px-4 py-3.5 duration-300 fade-in zoom-in-95',
              outcome.result === 'win' && 'border-win/25 bg-win/12',
              outcome.result === 'lose' && 'border-lose/25 bg-lose/10',
              outcome.result === 'draw' && 'border-mustard/50 bg-mustard/20',
            )}
          >
            <span
              className={cn(
                'flex size-12 shrink-0 items-center justify-center rounded-2xl text-primary-foreground',
                outcome.result === 'win' ? 'bg-win' : outcome.result === 'lose' ? 'bg-lose' : 'bg-cocoa',
              )}
              aria-hidden="true"
            >
              {outcome.result === 'win' ? <Trophy className="size-6" /> : outcome.result === 'lose' ? <Skull className="size-6" /> : <Handshake className="size-6" />}
            </span>
            <div className="min-w-0">
              {outcome.result === 'win' && (
                <>
                  <p className="font-display text-lg font-extrabold text-win">Победа!</p>
                  <p className="mt-0.5 text-sm">Перевес +{outcome.margin} — монстр побеждён</p>
                </>
              )}
              {outcome.result === 'lose' && (
                <>
                  <p className="font-display text-lg font-extrabold text-lose">Поражение</p>
                  <p className="mt-0.5 text-sm">Не хватает {outcome.margin + 1} — зовите на помощь или смывайтесь</p>
                </>
              )}
              {outcome.result === 'draw' && (
                <>
                  <p className="font-display text-lg font-extrabold">Ничья</p>
                  <p className="mt-0.5 text-sm">По правилам Манчкина побеждает монстр</p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface FieldProps {
  label: ReactNode
  htmlFor?: string
  children: (labelId: string) => ReactNode
}

function Field({ label, htmlFor, children }: FieldProps) {
  const id = useId()
  const Tag = htmlFor ? 'label' : 'p'
  return (
    <div>
      <Tag id={id} htmlFor={htmlFor} className="mt-[18px] mb-2 block text-sm font-bold">
        {label}
      </Tag>
      {children(id)}
    </div>
  )
}

const chipClass =
  'flex h-[52px] shrink-0 items-center rounded-full border-2 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

interface ChipGroupProps {
  labelledBy: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}

/** A row of chips that scrolls sideways when the table is large. */
function ChipGroup({ labelledBy, value, onChange, children }: ChipGroupProps) {
  return (
    <RadioGroup.Root
      aria-labelledby={labelledBy}
      orientation="horizontal"
      value={value}
      onValueChange={onChange}
      className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]"
    >
      {children}
    </RadioGroup.Root>
  )
}

function PlayerChip({ player, checked }: { player: Player; checked: boolean }) {
  return (
    <RadioGroup.Item
      value={player.id}
      aria-label={`${player.name}, сила ${power(player)}`}
      className={cn(chipClass, 'gap-2 pr-4 pl-[5px]', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background')}
    >
      <span
        className={cn(
          'flex size-[38px] items-center justify-center rounded-full font-display text-[15px] font-extrabold text-cocoa',
          checked ? 'bg-mustard' : 'bg-sand',
        )}
        aria-hidden="true"
      >
        {player.name.charAt(0).toUpperCase()}
      </span>
      <span className="max-w-32 truncate text-[15px] font-bold">{player.name}</span>
      <span className={cn('text-[13px] font-bold tabular-nums', checked ? 'text-[#ffd9c2]' : 'text-muted-foreground')}>{power(player)}</span>
    </RadioGroup.Item>
  )
}

interface StepButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  dark?: boolean
  size?: 'md' | 'lg'
  children: ReactNode
}

function StepButton({ label, onClick, disabled, dark = false, size = 'md', children }: StepButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex shrink-0 items-center justify-center transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 disabled:opacity-40 [&_svg]:size-[18px] [&_svg]:stroke-[2.5]',
        size === 'lg' ? 'size-16 rounded-[20px]' : 'size-11 rounded-[14px]',
        dark ? 'bg-cocoa text-primary-foreground' : 'bg-secondary text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function BonusRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const color = value > 0 ? 'text-win' : value < 0 ? 'text-lose' : 'text-muted-foreground'
  return (
    <div className="flex items-center gap-2.5 rounded-[18px] bg-background py-2 pr-2 pl-4">
      <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{label}</span>
      <StepButton label={`${label}: карта −1`} onClick={() => onChange(value - 1)}>
        <Minus />
      </StepButton>
      <span className={`w-10 text-center font-display text-lg font-extrabold tabular-nums ${color}`}>{formatBonus(value)}</span>
      <StepButton dark label={`${label}: карта +1`} onClick={() => onChange(value + 1)}>
        <Plus />
      </StepButton>
    </div>
  )
}

interface PowerBoxProps {
  label: string
  total: number
  base: number
  cards: number
  dark?: boolean
}

function PowerBox({ label, total, base, cards, dark = false }: PowerBoxProps) {
  return (
    <div className={cn('min-w-0 rounded-[22px] p-3.5 text-center text-primary-foreground', dark ? 'bg-cocoa' : 'bg-primary')}>
      <p className="truncate text-xs font-bold opacity-80">{label}</p>
      <p key={total} className="mt-1 animate-in font-display text-4xl leading-none font-extrabold tabular-nums duration-300 fade-in slide-in-from-bottom-1">
        {total}
      </p>
      <p className="mt-1 text-xs tabular-nums opacity-80">
        {cards === 0 ? 'без карт' : `${base} ${cards > 0 ? '+' : '−'} ${Math.abs(cards)}`}
      </p>
    </div>
  )
}
