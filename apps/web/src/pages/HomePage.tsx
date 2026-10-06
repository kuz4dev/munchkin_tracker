import { MAX_NAME_LENGTH, normalizeRoomCode, ROOM_CODE_LENGTH } from '@munchkin/core'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { describeJoinError } from '@/game/errors'
import { gameActions, useGame } from '@/game/store'
import { InstallHint } from '@/pwa/InstallHint'

export default function HomePage() {
  const navigate = useNavigate()
  // Shared links (/room/CODE) land here with ?code=CODE prefilled
  const [params] = useSearchParams()
  const notice = useGame((s) => s.notice)

  const [name, setName] = useState('')
  const [code, setCode] = useState(() => (params.get('code') ?? '').toUpperCase())
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState('')

  // A notice explains why we were sent back here (room closed, etc.)
  const shownError = error || notice
  useEffect(() => () => gameActions().clearNotice(), [])

  async function create() {
    gameActions().clearNotice()
    if (!name.trim()) return setError('Введите ваше имя')
    setBusy('create')
    setError('')
    try {
      const roomCode = await gameActions().createRoom(name.trim())
      navigate(`/room/${roomCode}`)
    } catch (e) {
      setError(describeJoinError(e, 'Не удалось создать комнату'))
    } finally {
      setBusy(null)
    }
  }

  async function join() {
    gameActions().clearNotice()
    if (!name.trim()) return setError('Введите ваше имя')
    if (!code.trim()) return setError('Введите код комнаты')
    setBusy('join')
    setError('')
    try {
      await gameActions().joinRoom(code, name.trim())
      navigate(`/room/${normalizeRoomCode(code)}`)
    } catch (e) {
      setError(describeJoinError(e, 'Не удалось войти в комнату'))
    } finally {
      setBusy(null)
    }
  }

  function onNameSubmit(e: FormEvent) {
    e.preventDefault()
    void (code ? join() : create())
  }

  function onCodeSubmit(e: FormEvent) {
    e.preventDefault()
    void join()
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8 [padding-bottom:max(2rem,env(safe-area-inset-bottom))] [padding-top:max(2rem,env(safe-area-inset-top))]">
      <div className="mb-6 text-center sm:mb-8">
        <div className="mb-3 text-5xl select-none sm:text-6xl" aria-hidden="true">
          🗡️
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Манчкин</h1>
        <p className="mt-1 text-base text-muted-foreground sm:text-lg">Трекер</p>
      </div>

      <Card className="w-full max-w-sm border-2 shadow-lg sm:max-w-md">
        <CardHeader className="pt-5 pb-2 text-center sm:pt-6">
          <CardDescription className="text-sm sm:text-base">
            Отслеживайте характеристики игроков в реальном времени
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-5 pb-6 sm:px-6">
          <form className="space-y-2" onSubmit={onNameSubmit}>
            <Label htmlFor="name" className="text-sm font-medium">
              Ваше имя
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите имя игрока"
              className="h-12 text-base"
              autoComplete="off"
              maxLength={MAX_NAME_LENGTH}
            />
          </form>

          {shownError && (
            <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive">
              {shownError}
            </div>
          )}

          <Button className="h-12 w-full text-base font-semibold" disabled={!!busy} onClick={create}>
            {busy === 'create' ? 'Создаём...' : 'Создать комнату'}
          </Button>

          <div className="flex items-center gap-4">
            <Separator className="flex-1" />
            <span className="text-sm whitespace-nowrap text-muted-foreground">или войдите</span>
            <Separator className="flex-1" />
          </div>

          <form className="space-y-2" onSubmit={onCodeSubmit}>
            <Label htmlFor="code" className="text-sm font-medium">
              Код комнаты
            </Label>
            <div className="flex gap-2">
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className="h-12 font-mono text-base tracking-widest uppercase"
                maxLength={ROOM_CODE_LENGTH}
                autoComplete="off"
                autoCapitalize="characters"
              />
              <Button type="submit" variant="outline" className="h-12 shrink-0 px-5 text-base font-semibold" disabled={!!busy}>
                {busy === 'join' ? 'Входим...' : 'Войти'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 max-w-xs text-center text-xs text-muted-foreground/70">
        Создайте комнату и поделитесь кодом с другими игроками
      </p>
      <InstallHint />
    </div>
  )
}
