import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('virtual:pwa-register/react', async () => {
  const { useState } = await import('react')
  return { useRegisterSW: () => ({ needRefresh: useState(false), offlineReady: useState(false), updateServiceWorker: vi.fn() }) }
})

describe('App routes', () => {
  it('serves the home page and sends unknown paths there', async () => {
    render(
      <MemoryRouter initialEntries={['/nope']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Манчкин' })).toBeInTheDocument()
  })

  it('loads the room screen on demand', async () => {
    render(
      <MemoryRouter initialEntries={['/room/ABC234']}>
        <App />
      </MemoryRouter>,
    )
    // While its code downloads, a loading screen shows instead of a blank page
    expect(screen.getByRole('status')).toHaveTextContent('Загрузка...')
    // No stored session: the lazily loaded room screen redirects home
    expect(await screen.findByRole('heading', { name: 'Манчкин' })).toBeInTheDocument()
  })
})
