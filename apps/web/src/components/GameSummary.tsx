import { CLASSES, formatDuration, getLabel, power, RACES, rankPlayers, type Player } from '@munchkin/core'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

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
    <Card className="gap-0 overflow-hidden border-2 border-primary/50 py-0 shadow-md">
      <div className="bg-primary/5 px-4 py-5 text-center sm:px-6">
        <div className="mb-2 text-4xl select-none" aria-hidden="true">
          {winner ? '🏆' : '🏁'}
        </div>
        <h2 className="text-xl font-extrabold sm:text-2xl">Игра окончена</h2>
        {winner ? (
          <p className="mt-1 text-base">
            Победитель: <span className="font-bold">{winner.name}</span>
          </p>
        ) : (
          <p className="mt-1 text-base text-muted-foreground">Без победителя</p>
        )}
        {duration && <p className="mt-1 text-sm text-muted-foreground">Длительность: {duration}</p>}
      </div>

      <CardContent className="space-y-4 px-4 py-4 sm:px-6">
        <ol className="space-y-2">
          {standings.map((p, i) => {
            const isWinner = p.id === winnerId
            return (
              <li
                key={p.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isWinner ? 'bg-primary/10 font-semibold' : 'bg-secondary/30'}`}
              >
                <span className="w-6 text-center text-sm text-muted-foreground tabular-nums">{isWinner ? '👑' : i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {p.name}
                    {p.id === playerId && <span className="text-xs font-normal text-muted-foreground"> (вы)</span>}
                  </p>
                  <p className="text-xs font-normal text-muted-foreground">
                    {getLabel(RACES, p.race)} · {getLabel(CLASSES, p.class)}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-sm">ур. {p.level}</p>
                  <p className="text-xs font-normal text-muted-foreground">сила {power(p)}</p>
                </div>
              </li>
            )
          })}
        </ol>
        <Button className="w-full" variant="outline" onClick={onLeave}>
          В главное меню
        </Button>
      </CardContent>
    </Card>
  )
}
