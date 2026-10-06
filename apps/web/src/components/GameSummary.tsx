import { CLASSES, formatDuration, getLabel, power, RACES, rankPlayers, type Player } from '@munchkin/core'
import { Crown } from 'lucide-react'
import { CrownArt, FlagArt } from '@/components/art'
import { Button } from '@/components/ui/button'

interface GameSummaryProps {
  players: Player[]
  playerId: string
  winnerId: string
  createdAt: number
  finishedAt: number
  onLeave: () => void
}

export function GameSummary({ players, playerId, winnerId, createdAt, finishedAt, onLeave }: GameSummaryProps) {
  const winner = players.find((p) => p.id === winnerId)
  const standings = rankPlayers(players, winnerId)
  const duration = createdAt && finishedAt ? formatDuration(finishedAt - createdAt) : ''

  return (
    <div className="flex flex-col gap-3.5">
      <section className="flex flex-col items-center rounded-[28px] bg-primary px-5 pt-4 pb-6 text-center text-primary-foreground">
        {winner ? <CrownArt className="size-40" /> : <FlagArt className="size-40" />}
        <h2 className="font-display text-2xl font-extrabold">Игра окончена</h2>
        {winner ? (
          <p className="mt-1.5 text-base">
            Победитель: <span className="font-bold">{winner.name}</span>
          </p>
        ) : (
          <p className="mt-1.5 text-base">Без победителя</p>
        )}
        {duration && <p className="mt-1 text-sm">Длительность: {duration}</p>}
      </section>

      <ol className="flex flex-col gap-2">
        {standings.map((p, i) => {
          const isWinner = p.id === winnerId
          return (
            <li
              key={p.id}
              className={`flex animate-in items-center gap-3 rounded-[22px] border-2 px-4 py-3 duration-300 fade-in slide-in-from-bottom-2 ${
                isWinner ? 'border-mustard bg-mustard/20' : 'border-border bg-card'
              }`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="flex w-6 justify-center font-display text-base font-extrabold text-muted-foreground tabular-nums">
                {isWinner ? <Crown className="size-5 text-terracotta-deep" aria-label="Победитель" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold">
                  {p.name}
                  {p.id === playerId && <span className="text-xs font-semibold text-muted-foreground"> (вы)</span>}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {getLabel(RACES, p.race)} · {getLabel(CLASSES, p.class)}
                </p>
              </div>
              <div className="text-right tabular-nums">
                <p className="font-display text-lg font-extrabold">ур. {p.level}</p>
                <p className="text-xs text-muted-foreground">сила {power(p)}</p>
              </div>
            </li>
          )
        })}
      </ol>

      <Button className="h-14 rounded-2xl bg-cocoa font-display text-base font-semibold text-primary-foreground hover:bg-cocoa/90" onClick={onLeave}>
        В главное меню
      </Button>
    </div>
  )
}
