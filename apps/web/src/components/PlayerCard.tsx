import { CLASSES, getLabel, MAX_LEVEL, power, RACES, type Player } from '@munchkin/core'

interface PlayerCardProps {
  player: Player
  isHost?: boolean
}

export function PlayerCard({ player, isHost = false }: PlayerCardProps) {
  const online = player.connected
  return (
    <article
      className={`flex animate-in items-center gap-3.5 rounded-[22px] border-2 px-4 py-3.5 duration-300 fade-in zoom-in-95 ${
        online ? 'border-border bg-card' : 'border-dashed border-border bg-secondary/40'
      }`}
    >
      <div
        className={`flex size-[50px] shrink-0 items-center justify-center rounded-2xl font-display text-xl font-extrabold ${
          online ? 'bg-mustard text-cocoa' : 'bg-border text-muted-foreground'
        }`}
        aria-hidden="true"
      >
        {player.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className={`truncate text-[17px] font-bold ${online ? '' : 'text-muted-foreground'}`}>
          {player.name}
          {isHost && <span className="text-xs font-semibold text-muted-foreground"> · хост</span>}
        </h3>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {online ? `${getLabel(RACES, player.race)} · ${getLabel(CLASSES, player.class)}` : 'не в сети'} · ур.{' '}
          {player.level} · бонусы {player.gearBonus}
        </p>
        <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${online ? 'bg-secondary' : 'bg-border'}`} aria-hidden="true">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${online ? 'bg-primary' : 'bg-muted-foreground/50'}`}
            style={{ width: `${(player.level / MAX_LEVEL) * 100}%` }}
          />
        </div>
      </div>
      <div className="shrink-0 text-center">
        <p
          key={power(player)}
          className={`animate-in font-display text-[28px] leading-none font-extrabold tabular-nums duration-300 fade-in slide-in-from-bottom-1 ${
            online ? '' : 'text-muted-foreground'
          }`}
        >
          {power(player)}
        </p>
        <p className="mt-1 text-[10px] font-bold tracking-[2px] text-muted-foreground">СИЛА</p>
      </div>
    </article>
  )
}
