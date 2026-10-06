import { MAX_NAME_LENGTH, normalizeRoomCode, ROOM_CODE_LENGTH } from '@munchkin/core'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowRight } from 'lucide-react'
import { HeroArt } from '@/components/art'
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

  const field =
    'h-14 rounded-2xl border-2 border-border bg-card px-[18px] text-[17px] shadow-none focus-visible:border-primary focus-visible:ring-primary/20'

  return (
    <div className="flex min-h-dvh justify-center bg-background [padding-bottom:max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-md flex-col px-[22px]">
        <HeroArt className="-mx-[22px] w-[calc(100%+44px)] max-w-none" />

        <h1 className="mt-6 font-display text-[40px] leading-none font-extrabold text-foreground">Манчкин</h1>
        <p className="mt-2.5 max-w-xs text-base leading-relaxed text-muted-foreground">
          Ведите уровни всей компании в реальном времени — каждый со своего телефона
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <form onSubmit={onNameSubmit}>
            <Label htmlFor="name" className="sr-only">
              Ваше имя
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя"
              className={field}
              autoComplete="off"
              maxLength={MAX_NAME_LENGTH}
            />
          </form>

          {shownError && (
            <div role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
              {shownError}
            </div>
          )}

          <Button
            className="h-14 justify-between rounded-2xl px-5 font-display text-base font-semibold"
            disabled={!!busy}
            onClick={create}
          >
            {busy === 'create' ? 'Создаём...' : 'Создать комнату'}
            <ArrowRight className="size-5" aria-hidden="true" />
          </Button>

          <form className="flex gap-2.5" onSubmit={onCodeSubmit}>
            <Label htmlFor="code" className="sr-only">
              Код комнаты
            </Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Код комнаты"
              className={`${field} min-w-0 flex-1 uppercase placeholder:normal-case [&:not(:placeholder-shown)]:font-display [&:not(:placeholder-shown)]:tracking-[0.2em]`}
              maxLength={ROOM_CODE_LENGTH}
              autoComplete="off"
              autoCapitalize="characters"
            />
            <Button
              type="submit"
              className="h-14 shrink-0 rounded-2xl bg-cocoa px-6 font-display text-[15px] font-semibold text-primary-foreground hover:bg-cocoa/90"
              disabled={!!busy}
            >
              {busy === 'join' ? 'Входим...' : 'Войти'}
            </Button>
          </form>
        </div>

        <div className="mt-auto pt-8">
          <InstallHint />
        </div>
      </div>
    </div>
  )
}
