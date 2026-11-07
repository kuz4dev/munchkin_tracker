import { ApiError } from '@munchkin/core'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, gameStore } from '@/game/store'
import HomePage from './HomePage'

function renderAt(url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:code" element={<p>room page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  gameStore.setState({ notice: '' })
})

describe('HomePage', () => {
  it('asks for a name first', async () => {
    renderAt()
    await userEvent.click(screen.getByRole('button', { name: 'Создать комнату' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Введите ваше имя')
  })

  it('asks for a code before joining', async () => {
    renderAt()
    await userEvent.type(screen.getByLabelText('Ваше имя'), 'Bob')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Введите код комнаты')
  })

  it('creates a room and opens it', async () => {
    const createRoom = vi.spyOn(gameStore.getState(), 'createRoom').mockResolvedValue('ABC234')
    renderAt()
    await userEvent.type(screen.getByLabelText('Ваше имя'), '  Alice  ')
    await userEvent.click(screen.getByRole('button', { name: 'Создать комнату' }))

    expect(createRoom).toHaveBeenCalledWith('Alice')
    expect(await screen.findByText('room page')).toBeInTheDocument()
  })

  it('joins by code (uppercased) on Enter', async () => {
    const joinRoom = vi.spyOn(gameStore.getState(), 'joinRoom').mockResolvedValue()
    renderAt()
    await userEvent.type(screen.getByLabelText('Ваше имя'), 'Bob')
    await userEvent.type(screen.getByLabelText('Код комнаты'), 'abc234{Enter}')

    expect(joinRoom).toHaveBeenCalledWith('ABC234', 'Bob')
    expect(await screen.findByText('room page')).toBeInTheDocument()
  })

  it('explains why joining failed and stays', async () => {
    vi.spyOn(gameStore.getState(), 'joinRoom').mockRejectedValue(new ApiError('nope', 404))
    renderAt()
    await userEvent.type(screen.getByLabelText('Ваше имя'), 'Bob')
    await userEvent.type(screen.getByLabelText('Код комнаты'), 'NOPE22{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Комната не найдена')
    expect(screen.queryByText('room page')).not.toBeInTheDocument()
  })

  it('prefills the code from a shared link', () => {
    renderAt('/?code=abc234')
    expect(screen.getByLabelText('Код комнаты')).toHaveValue('ABC234')
  })

  it('shows why we were sent back here', () => {
    gameStore.setState({ notice: 'Комната не найдена или уже закрыта' })
    renderAt()
    expect(screen.getByRole('alert')).toHaveTextContent('Комната не найдена или уже закрыта')
  })
})

describe('HomePage with a saved game', () => {
  const saved = { roomCode: 'ABC234', playerName: 'Alice', sessionId: 's1' }

  function withSaved() {
    vi.spyOn(gameStore.getState(), 'savedGame').mockResolvedValue(saved)
  }

  it('shows nothing extra without one', async () => {
    renderAt()
    expect(await screen.findByRole('button', { name: 'Создать комнату' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Незаконченная партия' })).not.toBeInTheDocument()
  })

  it('offers to return to the game', async () => {
    withSaved()
    vi.spyOn(api, 'getRoomInfo').mockResolvedValue({ code: 'ABC234', playerCount: 2 })
    renderAt()
    const card = await screen.findByRole('region', { name: 'Незаконченная партия' })
    expect(card).toHaveTextContent('Alice')
    expect(card).toHaveTextContent('Комната ABC234')
    expect(screen.getByRole('button', { name: 'Создать новую комнату' })).toBeInTheDocument()

    await userEvent.click(within(card).getByRole('button', { name: 'Вернуться в игру' }))
    expect(await screen.findByText('room page')).toBeInTheDocument()
  })

  it('tells when the room is gone and forgets it', async () => {
    withSaved()
    const forget = vi.spyOn(gameStore.getState(), 'forgetSavedGame').mockResolvedValue()
    vi.spyOn(api, 'getRoomInfo').mockRejectedValue(new ApiError('gone', 404))
    renderAt()
    expect(await screen.findByText('Партия уже закрыта')).toBeInTheDocument()
    expect(forget).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Вернуться в игру' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Создать комнату' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Скрыть' }))
    expect(screen.queryByText('Партия уже закрыта')).not.toBeInTheDocument()
  })

  it('still offers to return when the server can\'t be reached', async () => {
    withSaved()
    vi.spyOn(api, 'getRoomInfo').mockRejectedValue(new ApiError('down', 0))
    renderAt()
    expect(await screen.findByRole('button', { name: 'Вернуться в игру' })).toBeInTheDocument()
  })

  it('explains a long check, then offers to return', async () => {
    withSaved()
    let answer: (info: { code: string; playerCount: number }) => void = () => {}
    vi.spyOn(api, 'getRoomInfo').mockReturnValue(new Promise((resolve) => (answer = resolve)))
    renderAt()
    expect(await screen.findByRole('button', { name: 'Вернуться в игру' })).toBeInTheDocument()

    expect(await screen.findByText(/Будим сервер/, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Вернуться в игру' })).not.toBeInTheDocument()

    answer({ code: 'ABC234', playerCount: 2 })
    expect(await screen.findByRole('button', { name: 'Вернуться в игру' })).toBeInTheDocument()
  }, 7000)

  it('leaves for real only after confirming', async () => {
    withSaved()
    vi.spyOn(api, 'getRoomInfo').mockResolvedValue({ code: 'ABC234', playerCount: 2 })
    const abandon = vi.spyOn(gameStore.getState(), 'abandonSavedGame').mockResolvedValue()
    renderAt()

    await userEvent.click(await screen.findByRole('button', { name: 'Выйти из этой партии' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Выйти из этой партии?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Остаться' }))
    expect(abandon).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Вернуться в игру' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Выйти из этой партии' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Выйти' }))
    await waitFor(() => expect(abandon).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Незаконченная партия' })).not.toBeInTheDocument())
  })
})
