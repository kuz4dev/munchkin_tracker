import { ApiError } from '@munchkin/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gameStore } from '@/game/store'
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
