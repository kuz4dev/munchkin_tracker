import { byLevelThenName, MAX_LEVEL, power, type Player } from '@munchkin/core'
import { cn } from 'cn'
import { Crown, Flag } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useState } from 'react'
import { CheckDot, Sheet, SheetContent } from '@/components/ui/sheet'

const NO_WINNER = '__none__'

interface FinishGameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  players: Player[]
  playerId: string
  /** Preselected winner, e.g. the player who just reached the last level */
  suggestedWinnerId?: string
  onFinish: (winnerId?: string) => void
}

export function FinishGameDialog({ open, onOpenChange, players, playerId, suggestedWinnerId, onFinish }: FinishGameDialogProps) {
  const suggested = players.find((p) => p.id === suggestedWinnerId)
  const title = !suggested ? 'Завершить игру' : suggested.id === playerId ? 'Победа?' : `Победа: ${suggested.name}?`

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={title}
        eyebrow={suggested?.level === MAX_LEVEL ? `${MAX_LEVEL} уровень достигнут` : undefined}
        icon={suggested ? <Crown aria-hidden="true" /> : <Flag aria-hidden="true" />}
        description="Игра завершится для всех. Менять характеристики после этого будет нельзя."
      >
        {/* Remounts on every open, so the selection starts from the suggestion */}
        <FinishForm
          players={players}
          playerId={playerId}
          initialWinner={suggested?.id ?? NO_WINNER}
          onCancel={() => onOpenChange(false)}
          onFinish={(winner) => {
            onFinish(winner === NO_WINNER ? undefined : winner)
            onOpenChange(false)
          }}
        />
      </SheetContent>
    </Sheet>
  )
}

interface FinishFormProps {
  players: Player[]
  playerId: string
  initialWinner: string
  onCancel: () => void
  onFinish: (winner: string) => void
}

function FinishForm({ players, playerId, initialWinner, onCancel, onFinish }: FinishFormProps) {
  const [winner, setWinner] = useState(initialWinner)
  return (
    <>
      <p id="finish-winner" className="mt-[18px] mb-2 text-sm font-bold">
        Победитель
      </p>
      <RadioGroup.Root aria-labelledby="finish-winner" value={winner} onValueChange={setWinner} className="flex flex-col gap-2">
        {byLevelThenName(players).map((p) => {
          const checked = winner === p.id
          return (
            <RadioGroup.Item
              key={p.id}
              value={p.id}
              className={cn(
                'flex h-[68px] w-full items-center gap-3 rounded-[20px] border-2 px-3.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                checked ? 'border-primary bg-[#fff1e6]' : 'border-border bg-background',
              )}
            >
              <span
                className={cn(
                  'flex size-[42px] shrink-0 items-center justify-center rounded-[14px] font-display text-[17px] font-extrabold text-cocoa',
                  checked ? 'bg-mustard' : 'bg-sand',
                )}
                aria-hidden="true"
              >
                {p.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold">
                  {p.name}
                  {p.id === playerId && ' (вы)'}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">
                  Уровень {p.level} · сила {power(p)}
                </span>
              </span>
              <CheckDot checked={checked} />
            </RadioGroup.Item>
          )
        })}
        <RadioGroup.Item
          value={NO_WINNER}
          className={cn(
            'flex h-[52px] items-center justify-center gap-2 rounded-[18px] border-2 text-[15px] font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            winner === NO_WINNER ? 'border-solid border-primary bg-[#fff1e6] text-foreground' : 'border-dashed border-border text-muted-foreground',
          )}
        >
          <Flag className="size-[18px]" aria-hidden="true" />
          Без победителя
        </RadioGroup.Item>
      </RadioGroup.Root>

      <button
        type="button"
        onClick={() => onFinish(winner)}
        className="mt-5 h-14 w-full rounded-[18px] bg-primary font-display text-[15px] font-semibold text-primary-foreground transition-transform outline-none hover:bg-terracotta-deep focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]"
      >
        Завершить игру
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 h-[50px] w-full rounded-[18px] text-[15px] font-bold outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Продолжить игру
      </button>
    </>
  )
}
