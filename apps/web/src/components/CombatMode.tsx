import { formatBonus, power, resolveCombat, type Player } from '@munchkin/core'
import { Handshake, Skull, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const NO_ALLY = '__none__'

/** Combat calculator. Lives inside a dialog, so its state resets on close. */
export function CombatMode({ players }: { players: Player[] }) {
  const [playerId, setPlayerId] = useState('')
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

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="combat-player">Игрок</Label>
        <Select value={player ? playerId : ''} onValueChange={choosePlayer}>
          <SelectTrigger id="combat-player" className="w-full">
            <SelectValue placeholder="Выберите игрока..." />
          </SelectTrigger>
          <SelectContent>
            {players.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} <span className="ml-1 text-xs text-muted-foreground">({power(p)})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {player && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="combat-ally">
              Союзник <span className="text-xs font-normal text-muted-foreground">(необязательно)</span>
            </Label>
            <Select value={ally ? allyId : NO_ALLY} onValueChange={setAllyId}>
              <SelectTrigger id="combat-ally" className="w-full">
                <SelectValue placeholder="Без союзника" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ALLY}>Без союзника</SelectItem>
                {players
                  .filter((p) => p.id !== player.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="ml-1 text-xs text-muted-foreground">({power(p)})</span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Карты</Label>
            <div className="space-y-1.5">
              <BonusRow label={side} value={playerCards} onChange={setPlayerCards} />
              <BonusRow label="Противник" value={monsterCards} onChange={setMonsterCards} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="combat-monster">Сила противника</Label>
            <Input
              id="combat-monster"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="Введите силу..."
              value={monsterInput}
              onChange={(e) => setMonsterInput(e.target.value)}
            />
          </div>
        </>
      )}

      {outcome && (
        <>
          <div className="flex items-center justify-between gap-2">
            <PowerBox label={side} total={outcome.playerTotal} base={outcome.playerBase} cards={playerCards} />
            <span className="text-lg font-bold text-muted-foreground">vs</span>
            <PowerBox label="Противник" total={outcome.monsterTotal} base={monsterPower} cards={monsterCards} />
          </div>

          <div
            role="status"
            className={`animate-in rounded-2xl px-4 py-3 text-center duration-300 fade-in zoom-in-95 ${
              outcome.result === 'win' ? 'bg-win/12' : outcome.result === 'lose' ? 'bg-lose/10' : 'bg-mustard/25'
            }`}
          >
            {outcome.result === 'win' && (
              <>
                <p className="flex items-center justify-center gap-2 font-display text-lg font-extrabold text-win">
                  <Trophy className="size-5" aria-hidden="true" />
                  Победа!
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Перевес: <span className="font-bold text-foreground">+{outcome.margin}</span>
                </p>
              </>
            )}
            {outcome.result === 'lose' && (
              <>
                <p className="flex items-center justify-center gap-2 font-display text-lg font-extrabold text-lose">
                  <Skull className="size-5" aria-hidden="true" />
                  Поражение
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Перевес противника: <span className="font-bold text-foreground">+{outcome.margin}</span>
                </p>
              </>
            )}
            {outcome.result === 'draw' && (
              <>
                <p className="flex items-center justify-center gap-2 font-display text-lg font-extrabold text-foreground">
                  <Handshake className="size-5" aria-hidden="true" />
                  Ничья
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">По правилам Манчкина — победитель монстр</p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BonusRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const color = value > 0 ? 'text-win' : value < 0 ? 'text-lose' : 'text-muted-foreground'
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{label}</span>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label={`${label}: карта −1`} onClick={() => onChange(value - 1)}>
          −
        </Button>
        <span className={`w-8 text-center text-sm font-bold tabular-nums ${color}`}>{formatBonus(value)}</span>
        <Button variant="outline" size="icon-sm" aria-label={`${label}: карта +1`} onClick={() => onChange(value + 1)}>
          +
        </Button>
      </div>
    </div>
  )
}

function PowerBox({ label, total, base, cards }: { label: string; total: number; base: number; cards: number }) {
  return (
    <div className="flex-1 rounded-2xl bg-secondary/60 px-3 py-2 text-center">
      <p className="truncate text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-extrabold tabular-nums">{total}</p>
      {cards !== 0 && (
        <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
          {base} {cards > 0 ? '+' : '−'} {Math.abs(cards)}
        </p>
      )}
    </div>
  )
}
