import { ArrowRight, Moon, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { DoorArt } from '@/components/art'
import { ConfirmDialog } from '@/components/ui/sheet'
import type { SavedGame } from '@/game/useSavedGame'

const closeClass =
  'flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95'

interface ResumeCardProps {
  game: SavedGame
  disabled: boolean
  onResume: () => void
  /** Really leaves the game, after a confirmation */
  onAbandon: () => void
  /** Hides the notice about a closed game */
  onDismiss: () => void
}

/** An unfinished game this device can return to. Calm on purpose: the home screen is still the home screen. */
export function ResumeCard({ game, disabled, onResume, onAbandon, onDismiss }: ResumeCardProps) {
  const [confirming, setConfirming] = useState(false)

  if (game.phase === 'gone') {
    return (
      <Card>
        <div role="status" className="flex items-center justify-between gap-2">
          <Title title="Партия уже закрыта" code={game.roomCode} />
          <button type="button" aria-label="Скрыть" onClick={onDismiss} className={closeClass}>
            <X className="size-[18px]" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <Title title={game.playerName} code={game.roomCode} />
        <button type="button" aria-label="Выйти из этой партии" disabled={disabled} onClick={() => setConfirming(true)} className={closeClass}>
          <X className="size-[18px]" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>

      {game.phase === 'waking' ? (
        <div role="status" className="mt-2.5 flex h-[50px] items-center justify-center gap-2 rounded-full bg-secondary px-4 text-sm font-bold">
          <Moon className="size-5 animate-pulse" aria-hidden="true" />
          Будим сервер, это до минуты…
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onResume}
          className="mt-2.5 flex h-[50px] w-full items-center justify-center gap-2 rounded-full bg-cocoa text-base font-bold text-primary-foreground transition-transform outline-none hover:bg-cocoa/90 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98] disabled:opacity-50"
        >
          Вернуться в игру
          <ArrowRight className="size-5" aria-hidden="true" />
        </button>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Выйти из этой партии?"
        description={`${game.playerName} уйдёт из-за стола, а если вы хост, роль перейдёт другому игроку. Вернуться можно по коду комнаты, но уже с 1 уровня.`}
        art={<DoorArt className="mx-auto w-32" />}
        confirmLabel="Выйти"
        cancelLabel="Остаться"
        onConfirm={onAbandon}
      />
    </Card>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Незаконченная партия" className="mt-3.5 animate-in rounded-3xl border-2 border-border bg-card py-3 pr-3 pl-4 duration-300 fade-in">
      {children}
    </section>
  )
}

function Title({ title, code }: { title: string; code: string }) {
  return (
    <div className="min-w-0">
      <h2 className="truncate text-base leading-[22px] font-bold">{title}</h2>
      <p className="text-sm leading-5 text-muted-foreground">Комната {code}</p>
    </div>
  )
}
