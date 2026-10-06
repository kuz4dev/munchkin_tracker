import { power, selectConnected, selectCurrentPlayer, selectOtherPlayers } from '@munchkin/core'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { gameActions, gameStore, useGame, useGameShallow } from '@/game/store'

// Step 1 skeleton: proves routing, store and server work end to end.
// The full room UI is ported in the next step.
export default function RoomPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const roomCode = useGame((s) => s.roomCode)
  const connected = useGame(selectConnected)
  const me = useGame(selectCurrentPlayer)
  const others = useGameShallow(selectOtherPlayers)

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

  function leave() {
    gameActions().leaveRoom()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center justify-between border-b-2 px-4 py-3">
        <span className="font-mono text-lg font-bold tracking-widest">{code}</span>
        <div className="flex items-center gap-3">
          <span className={`size-2 rounded-full ${connected ? 'bg-game-green' : 'bg-destructive'}`} />
          <Button variant="ghost" size="sm" onClick={leave}>
            Выйти
          </Button>
        </div>
      </header>
      {!me ? (
        <p className="py-16 text-center text-muted-foreground">{resuming ? 'Переподключение...' : 'Подключение...'}</p>
      ) : (
        <main className="mx-auto max-w-4xl space-y-4 p-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Ваш персонаж</p>
            <p className="text-xl font-bold">{me.name}</p>
            <p>
              Уровень {me.level} · сила {power(me)}
            </p>
          </Card>
          {others.map((p) => (
            <Card key={p.id} className={`p-4 ${p.connected ? '' : 'opacity-60'}`}>
              <p className="font-bold">{p.name}</p>
              <p className="text-muted-foreground">
                Уровень {p.level} · сила {power(p)}
                {p.connected ? '' : ' · не в сети'}
              </p>
            </Card>
          ))}
        </main>
      )}
    </div>
  )
}
