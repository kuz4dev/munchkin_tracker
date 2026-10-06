import { CLASSES, GENDERS, getLabel, power, RACES, type Player } from '@munchkin/core'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface PlayerCardProps {
  player: Player
  isHost?: boolean
}

export function PlayerCard({ player, isHost = false }: PlayerCardProps) {
  return (
    <Card className={`gap-0 overflow-hidden border-2 py-0 transition-all hover:shadow-md ${player.connected ? '' : 'opacity-60'}`}>
      <div className="flex items-center justify-between bg-secondary/40 px-4 py-3">
        <div className="mr-2 min-w-0">
          <h3 className="truncate text-base font-bold text-foreground">
            {player.name}
            {isHost && <span className="text-xs font-normal text-muted-foreground"> · хост</span>}
          </h3>
          {!player.connected && <p className="text-xs text-muted-foreground">не в сети</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-primary-foreground">
          <span className="text-xl leading-none font-extrabold tabular-nums">{power(player)}</span>
          <span className="text-[10px] font-medium opacity-80">СИЛА</span>
        </div>
      </div>

      <CardContent className="space-y-2.5 px-4 py-3">
        <div className="flex gap-3">
          <Stat label="Уровень" value={player.level} />
          <Stat label="Бонусы" value={player.gearBonus} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[getLabel(GENDERS, player.gender), getLabel(RACES, player.race), getLabel(CLASSES, player.class)].map((t, i) => (
            <Badge key={i} variant="outline" className="flex-1 px-2 py-0.5 text-xs">
              {t}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 rounded-lg bg-secondary/30 px-3 py-2 text-center">
      <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-foreground tabular-nums">{value}</p>
    </div>
  )
}
