import { render, screen } from '@testing-library/react'
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
