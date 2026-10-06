import {
  MAX_LEVEL,
  selectAllPlayers,
  selectConnected,
  selectCurrentPlayer,
  selectHasOlder,
  selectHost,
  selectIsFinished,
  selectIsHost,
  selectOtherPlayers,
} from '@munchkin/core'
import { Flag, Swords } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ChangeLog } from '@/components/ChangeLog'
import { DoorArt } from '@/components/art'
import { CombatMode } from '@/components/CombatMode'
import { FinishGameDialog } from '@/components/FinishGameDialog'
import { GameSummary } from '@/components/GameSummary'
import { InviteButton } from '@/components/InviteButton'
import { PlayerCard } from '@/components/PlayerCard'
import { RoomHeader } from '@/components/RoomHeader'
import { StatsEditor } from '@/components/StatsEditor'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { gameActions, gameStore, useGame, useGameShallow } from '@/game/store'
import { useWakeLock } from '@/hooks/useWakeLock'

export default function RoomPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()

  const roomCode = useGame((s) => s.roomCode)
  const playerId = useGame((s) => s.playerId)
  const connected = useGame(selectConnected)
  const me = useGame(selectCurrentPlayer)
  const others = useGameShallow(selectOtherPlayers)
  const players = useGameShallow(selectAllPlayers)
  const isHost = useGame(selectIsHost)
  const host = useGame(selectHost)
  const isFinished = useGame(selectIsFinished)
  const changelog = useGame((s) => s.changelog)
  const hasOlder = useGame(selectHasOlder)
  const loadingOlder = useGame((s) => s.loadingOlder)
  const { winnerId, createdAt, finishedAt } = useGameShallow((s) => ({
    winnerId: s.winnerId,
    createdAt: s.createdAt,
    finishedAt: s.finishedAt,
  }))

  // Keep the phone's screen on during the game
  useWakeLock(!!me && !isFinished)

  const [finishOpen, setFinishOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [suggestedWinner, setSuggestedWinner] = useState<string>()

  // Opened directly (reload, shared link): resume our seat or go home
  const [resuming, setResuming] = useState(() => !gameStore.getState().roomCode)
  useEffect(() => {
    if (gameStore.getState().roomCode) return
    void gameActions()
      .resumeSession(code)
      .then((result) => {
        if (result !== 'resumed') navigate(`/?code=${encodeURIComponent(code)}`, { replace: true })
      })
      .finally(() => setResuming(false))
  }, [code, navigate])

  // The room was closed under us (not found, replaced by another tab)
  useEffect(() => {
    if (!roomCode && !resuming && gameStore.getState().notice) navigate('/', { replace: true })
  }, [roomCode, resuming, navigate])

  // Someone just reached the last level: offer the host to finish with them as winner
  const previousLevels = useRef(new Map<string, number>())
  useEffect(() => {
    const before = previousLevels.current
    if (isHost && !isFinished) {
      const champion = players.find((p) => {
        const was = before.get(p.id)
        return was !== undefined && was < MAX_LEVEL && p.level === MAX_LEVEL
      })
      if (champion) {
        setSuggestedWinner(champion.id)
        setFinishOpen(true)
      }
    }
    previousLevels.current = new Map(players.map((p) => [p.id, p.level]))
  }, [players, isHost, isFinished])

  function leave() {
    gameActions().leaveRoom()
    navigate('/', { replace: true })
  }

  // Leaving an active game gives up the seat (and the host role): ask first
  function requestLeave() {
    if (me && !isFinished) setLeaveOpen(true)
    else leave()
  }

  function openFinish() {
    setSuggestedWinner(undefined)
    setFinishOpen(true)
  }

  const journal = (
    <ChangeLog entries={changelog} hasOlder={hasOlder} loadingOlder={loadingOlder} onLoadOlder={() => gameActions().loadOlder()} />
  )

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {roomCode && <RoomHeader code={roomCode} connected={connected} onLeave={requestLeave} />}

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3.5 px-4 pt-1.5 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
        {resuming || !me ? (
          <Waiting text={resuming ? 'Переподключение...' : 'Подключение...'} />
        ) : isFinished ? (
          <>
            <GameSummary
              players={players}
              playerId={playerId}
              winnerId={winnerId}
              createdAt={createdAt}
              finishedAt={finishedAt}
              onLeave={leave}
            />
            {journal}
          </>
        ) : (
          <>
            <StatsEditor player={me} isHost={isHost} onChange={(stats) => gameActions().updateStats(stats)} />

            <div className={`grid gap-2.5 ${isHost ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    aria-label="Режим боя"
                    className="h-14 rounded-[18px] bg-mustard font-display text-[15px] font-semibold text-cocoa hover:bg-mustard/90"
                  >
                    <Swords className="size-5" aria-hidden="true" />
                    Бой
                  </Button>
                </SheetTrigger>
                <SheetContent
                  title="Бой"
                  icon={<Swords aria-hidden="true" />}
                  description="Сравните силу вашей стороны с противником"
                  hideDescription
                  className="h-[92dvh]"
                >
                  <CombatMode players={players} defaultPlayerId={playerId} />
                </SheetContent>
              </Sheet>

              {isHost && (
                <Button
                  aria-label="Завершить игру"
                  variant="outline"
                  className="h-14 rounded-[18px] border-2 bg-card text-[15px] font-bold"
                  disabled={!connected}
                  onClick={openFinish}
                >
                  <Flag className="size-[18px]" aria-hidden="true" />
                  Завершить
                </Button>
              )}
            </div>
            {!isHost && host && (
              <p className="text-center text-[13px] text-muted-foreground">Завершить игру может хост — {host.name}</p>
            )}

            {journal}

            {others.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h2 className="mt-2.5 font-display text-lg font-extrabold">За столом</h2>
                {others.map((p) => (
                  <PlayerCard key={p.id} player={p} isHost={p.id === host?.id} />
                ))}
              </section>
            ) : (
              connected && (
                <div className="flex flex-col items-center py-6 text-center">
                  <DoorArt className="w-48" />
                  <p className="mt-4 font-display text-lg font-extrabold">Ждём игроков</p>
                  <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                    Отправьте друзьям ссылку или продиктуйте код комнаты
                  </p>
                  <InviteButton code={roomCode} />
                </div>
              )
            )}

            {isHost && (
              <FinishGameDialog
                open={finishOpen}
                onOpenChange={setFinishOpen}
                players={players}
                playerId={playerId}
                suggestedWinnerId={suggestedWinner}
                onFinish={(winner) => gameActions().finishGame(winner)}
              />
            )}
          </>
        )}
      </main>

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Выйти из комнаты?"
        description={
          isHost && others.length > 0
            ? 'Вы хост — роль перейдёт другому игроку. Ваш персонаж уйдёт из-за стола.'
            : others.length === 0
              ? 'Вы последний за столом. Если никто не зайдёт, комната закроется через 10\u00a0минут.'
              : 'Ваш персонаж уйдёт из-за стола. Вернуться можно по коду комнаты, но уже с 1 уровня.'
        }
        art={<DoorArt className="mx-auto w-32" />}
        confirmLabel="Выйти"
        cancelLabel="Остаться"
        onConfirm={leave}
      />
    </div>
  )
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 size-9 animate-spin rounded-full border-4 border-mustard border-t-transparent" aria-hidden="true" />
      <p className="text-base font-semibold text-muted-foreground">{text}</p>
    </div>
  )
}
