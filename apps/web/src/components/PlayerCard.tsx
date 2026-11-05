import { classLabel, DEFAULT_END_LEVEL, GENDERS, getLabel, power, raceLabel, type Player } from '@munchkin/core'
import { cn } from 'cn'
import type { ReactNode } from 'react'

interface PlayerCardProps {
  player: Player
  isHost?: boolean
  endLevel?: number
}

/** Another player at the table: every stat stays visible, long values wrap instead of being cut. */
export function PlayerCard({ player, isHost = false, endLevel = DEFAULT_END_LEVEL }: PlayerCardProps) {
  const online = player.connected
  const progress = Math.min(100, (player.level / endLevel) * 100)
  return (
    <article
      className={cn(
        'animate-in rounded-[22px] border-2 border-border px-4 py-3.5 duration-300 fade-in zoom-in-95',
        online ? 'bg-card' : 'border-dashed bg-secondary/40',
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-[46px] shrink-0 items-center justify-center rounded-[15px] font-display text-[19px] font-extrabold',
            online ? 'bg-mustard text-cocoa' : 'bg-border text-muted-foreground',
          )}
          aria-hidden="true"
        >
          {player.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="min-w-0 text-[17px] leading-[22px] font-bold [overflow-wrap:anywhere]">{player.name}</h3>
          {isHost && <span className="inline-flex h-[22px] items-center rounded-full bg-cocoa px-2 text-[11px] font-bold text-primary-foreground">Хост</span>}
          {!online && <span className="inline-flex h-[22px] items-center rounded-full bg-border px-2 text-[11px] font-bold">Не в сети</span>}
        </div>
        <div className="shrink-0 text-center">
          <p
            key={power(player)}
            className={cn(
              'animate-in font-display text-[28px] leading-none font-extrabold tabular-nums duration-300 fade-in slide-in-from-bottom-1',
              !online && 'text-muted-foreground',
            )}
          >
            {power(player)}
          </p>
          <p className="mt-1 text-[10px] font-bold tracking-[2px] text-muted-foreground">СИЛА</p>
        </div>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-2">
        <Stat label="Уровень" value={player.level} online={online} progress={progress} />
        <Stat label="Бонусы" value={player.gearBonus} online={online} />
      </dl>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip>{getLabel(GENDERS, player.gender)}</Chip>
        <Chip>{raceLabel(player)}</Chip>
        <Chip>{classLabel(player)}</Chip>
      </div>

      {(player.halfBreed || player.superMunchkin) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {player.halfBreed && <CardBadge>Полукровка</CardBadge>}
          {player.superMunchkin && <CardBadge>Суперманчкин</CardBadge>}
        </div>
      )}
    </article>
  )
}

interface StatProps {
  label: string
  value: number
  online: boolean
  /** Percent of the tile to fill: the level tile doubles as a progress bar */
  progress?: number
}

function Stat({ label, value, online, progress }: StatProps) {
  return (
    <div className={cn('relative flex h-[42px] items-center justify-between gap-2 overflow-hidden rounded-[14px] px-3', online ? 'bg-background' : 'bg-card/50')}>
      {progress !== undefined && (
        <div
          className={cn('absolute inset-y-0 left-0 transition-[width] duration-500', online ? 'bg-[#efc3a6]' : 'bg-border')}
          style={{ width: `${progress}%` }}
          aria-hidden="true"
        />
      )}
      {/* Cocoa reads on the fill and on the tile alike */}
      <dt className={cn('relative text-[13px]', progress === undefined && 'text-muted-foreground')}>{label}</dt>
      <dd key={value} className="relative animate-in font-display text-lg leading-none font-extrabold tabular-nums duration-300 fade-in slide-in-from-bottom-1">
        {value}
      </dd>
    </div>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex min-h-[26px] items-center rounded-full bg-secondary px-2.5 py-0.5 text-[13px] font-medium">{children}</span>
}

function CardBadge({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-6 items-center rounded-full bg-mustard px-2.5 text-xs font-bold text-cocoa">{children}</span>
}
