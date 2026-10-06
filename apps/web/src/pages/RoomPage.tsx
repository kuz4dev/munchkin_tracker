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
import { CombatMode } from '@/components/CombatMode'
import { FinishGameDialog } from '@/components/FinishGameDialog'
import { GameSummary } from '@/components/GameSummary'
import { PlayerCard } from '@/components/PlayerCard'
import { RoomHeader } from '@/components/RoomHeader'
import { StatsEditor } from '@/components/StatsEditor'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { gameActions, gameStore, useGame, useGameShallow } from '@/game/store'

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

  const [finishOpen, setFinishOpen] = useState(false)
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

  function openFinish() {
    setSuggestedWinner(undefined)
    setFinishOpen(true)
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomCode || code)
    } catch {
      // the code is visible anyway
    }
  }

  const journal = (
    <ChangeLog entries={changelog} hasOlder={hasOlder} loadingOlder={loadingOlder} onLoadOlder={() => gameActions().loadOlder()} />
  )

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {roomCode && <RoomHeader code={roomCode} connected={connected} onLeave={leave} />}

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:space-y-6 sm:px-4 sm:py-6">
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
            {journal}

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-10 w-full">
                  <Swords aria-hidden="true" />
                  Режим боя
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>⚔️ Режим боя</DialogTitle>
                </DialogHeader>
                <CombatMode players={players} />
              </DialogContent>
            </Dialog>

            {isHost ? (
              <Button variant="ghost" className="h-10 w-full text-muted-foreground" disabled={!connected} onClick={openFinish}>
                <Flag aria-hidden="true" />
                Завершить игру
              </Button>
            ) : (
              host && (
                <p className="text-center text-xs text-muted-foreground">Завершить игру может хост — {host.name}</p>
              )
            )}

            {others.length > 0 ? (
              <section>
                <div className="mb-3 flex items-center gap-2 sm:mb-4">
                  <h2 className="text-base font-bold text-foreground sm:text-lg">Другие игроки</h2>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{others.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                  {others.map((p) => (
                    <PlayerCard key={p.id} player={p} isHost={p.id === host?.id} />
                  ))}
                </div>
              </section>
            ) : (
              connected && (
                <div className="flex flex-col items-center justify-center py-12 text-center sm:py-16">
                  <div className="mb-4 animate-bounce text-4xl select-none" aria-hidden="true">
                    ⏳
                  </div>
                  <p className="text-base font-medium text-muted-foreground">Ожидание других игроков...</p>
                  <p className="mt-1 text-sm text-muted-foreground/70">Поделитесь кодом комнаты</p>
                  <button
                    type="button"
                    onClick={copyCode}
                    className="mt-3 rounded-lg bg-secondary px-4 py-2 font-mono text-sm font-bold tracking-wider transition-colors hover:bg-accent active:scale-95"
                  >
                    {roomCode}
                  </button>
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
    </div>
  )
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center sm:py-16">
      <div className="mb-4 size-8 animate-spin rounded-full border-3 border-primary border-t-transparent" aria-hidden="true" />
      <p className="text-base font-medium text-muted-foreground">{text}</p>
    </div>
  )
}
