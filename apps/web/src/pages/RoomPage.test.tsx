import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gameStore } from '@/game/store'
import RoomPage from './RoomPage'

function Home() {
  const { search } = useLocation()
  return <p>home{search}</p>
}

function renderRoom(code: string) {
  return render(
    <MemoryRouter initialEntries={[`/room/${code}`]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:code" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RoomPage', () => {
  it('sends visitors without a session home with the code prefilled', async () => {
    const resume = vi.spyOn(gameStore.getState(), 'resumeSession').mockResolvedValue('no_session')
    renderRoom('ABC234')

    expect(resume).toHaveBeenCalledWith('ABC234')
    expect(await screen.findByText('home?code=ABC234')).toBeInTheDocument()
  })

  it('stays while resuming a stored session', async () => {
    vi.spyOn(gameStore.getState(), 'resumeSession').mockResolvedValue('resumed')
    renderRoom('ABC234')
    expect(await screen.findByText('Переподключение...')).toBeInTheDocument()
    expect(screen.queryByText(/^home/)).not.toBeInTheDocument()
  })
})

describe('RoomPage in a game', () => {
  async function inRoom(state: Partial<ReturnType<typeof gameStore.getState>>) {
    const { act } = await import('@testing-library/react')
    gameStore.setState({
      roomCode: 'ABC234',
      playerId: 'p1',
      connectionStatus: 'connected',
      status: 'active',
      changelog: [],
      ...state,
    })
    renderRoom('ABC234')
    return act
  }

  afterEach(() => {
    gameStore.setState({ roomCode: '', playerId: '', players: {}, hostId: '', status: 'active', winnerId: '', endLevel: 10 })
  })

  it('lets only the host finish the game', async () => {
    const { player } = await import('@/test/fixtures')
    await inRoom({ players: { p1: player('p1', 'Alice'), p2: player('p2', 'Bob') }, hostId: 'p2' })
    expect(screen.queryByRole('button', { name: 'Завершить игру' })).not.toBeInTheDocument()
    expect(screen.getByText('Завершить игру может хост — Bob')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('offers the host to finish when someone reaches level 10', async () => {
    const { player } = await import('@/test/fixtures')
    const act = await inRoom({ players: { p1: player('p1', 'Alice'), p2: player('p2', 'Bob', { level: 9 }) }, hostId: 'p1' })
    expect(screen.getByRole('button', { name: 'Завершить игру' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    act(() => {
      gameStore.setState((s) => ({ players: { ...s.players, p2: player('p2', 'Bob', { level: 10 }) } }))
    })
    expect(await screen.findByRole('heading', { name: 'Победа: Bob?' })).toBeInTheDocument()
  })

  it('asks before leaving an active game and warns the host', async () => {
    const { player } = await import('@/test/fixtures')
    const leaveRoom = vi.spyOn(gameStore.getState(), 'leaveRoom').mockImplementation(() => {})
    await inRoom({ players: { p1: player('p1', 'Alice'), p2: player('p2', 'Bob') }, hostId: 'p1' })

    await userEvent.click(screen.getByRole('button', { name: 'Выйти из комнаты' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Выйти из комнаты?' })
    expect(dialog).toHaveTextContent('роль перейдёт другому игроку')
    await userEvent.click(screen.getByRole('button', { name: 'Остаться' }))
    expect(leaveRoom).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Выйти из комнаты' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Выйти' }))
    expect(leaveRoom).toHaveBeenCalled()
    expect(await screen.findByText('home')).toBeInTheDocument()
  })

  it('offers the host to finish at a raised end level, not at 10', async () => {
    const { player } = await import('@/test/fixtures')
    const act = await inRoom({ players: { p1: player('p1', 'Alice'), p2: player('p2', 'Bob', { level: 9 }) }, hostId: 'p1', endLevel: 12 })
    act(() => {
      gameStore.setState((s) => ({ players: { ...s.players, p2: player('p2', 'Bob', { level: 10 }) } }))
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => {
      gameStore.setState((s) => ({ players: { ...s.players, p2: player('p2', 'Bob', { level: 12 }) } }))
    })
    expect(await screen.findByText('12 уровень достигнут')).toBeInTheDocument()
  })

  it('lets anyone die, closing the fight, and applies the choice', async () => {
    const { player } = await import('@/test/fixtures')
    const die = vi.spyOn(gameStore.getState(), 'die').mockImplementation(() => {})
    await inRoom({ players: { p1: player('p1', 'Alice', { level: 7, gearBonus: 5 }), p2: player('p2', 'Bob') }, hostId: 'p2' })

    await userEvent.click(screen.getByRole('button', { name: 'Погибнуть' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Погибнуть?' })
    expect(dialog).toHaveTextContent('Бонусы 5 → 0, уровень 7 → 1')
    await userEvent.click(screen.getByRole('button', { name: 'Ещё поживу' }))
    expect(die).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Режим боя' }))
    await userEvent.type(await screen.findByLabelText('Сила противника'), '99')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Погибнуть' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Погибнуть' }))
    expect(die).toHaveBeenCalledWith(true)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows the results of a finished game', async () => {
    const { player } = await import('@/test/fixtures')
    await inRoom({ players: { p1: player('p1', 'Alice', { level: 10 }) }, hostId: 'p1', status: 'finished', winnerId: 'p1', createdAt: 1, finishedAt: 2 })
    expect(screen.getByText('Игра окончена')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Режим боя' })).not.toBeInTheDocument()
  })
})
