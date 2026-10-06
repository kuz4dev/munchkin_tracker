import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from '@/hooks/useWakeLock'

const sw = vi.hoisted(() => ({ needRefresh: false, update: vi.fn() }))
vi.mock('virtual:pwa-register/react', async () => {
  const { useState } = await import('react')
  return {
    useRegisterSW: () => {
      const needRefresh = useState(sw.needRefresh)
      return { needRefresh, offlineReady: useState(false), updateServiceWorker: sw.update }
    },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'wakeLock')
})

function fakeWakeLock() {
  const sentinels: { released: boolean; release: () => Promise<void> }[] = []
  const request = vi.fn(async () => {
    const s = {
      released: false,
      release: vi.fn(async () => {
        s.released = true
      }),
    }
    sentinels.push(s)
    return s
  })
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
  return { request, sentinels }
}

describe('useWakeLock', () => {
  it('keeps the screen on during a game and lets go after', async () => {
    const { request, sentinels } = fakeWakeLock()
    const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } })
    await act(async () => {})
    expect(request).toHaveBeenCalledWith('screen')

    rerender({ active: false })
    await act(async () => {})
    expect(sentinels[0]!.released).toBe(true)
  })

  it('asks again when the page becomes visible (the browser drops the lock)', async () => {
    const { request, sentinels } = fakeWakeLock()
    renderHook(() => useWakeLock(true))
    await act(async () => {})
    sentinels[0]!.released = true // tab was hidden

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does nothing where unsupported or inactive', async () => {
    renderHook(() => useWakeLock(true)) // no navigator.wakeLock: must not throw
    const { request } = fakeWakeLock()
    renderHook(() => useWakeLock(false))
    await act(async () => {})
    expect(request).not.toHaveBeenCalled()
  })
})

describe('install', () => {
  it('shows the install button once the browser allows it', async () => {
    const { InstallHint } = await import('./InstallHint')
    render(<InstallHint />)
    expect(screen.queryByRole('button', { name: 'Установить на телефон' })).not.toBeInTheDocument()

    const prompt = vi.fn(async () => {})
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    act(() => {
      window.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true) // our button instead of the mini-infobar

    await userEvent.click(screen.getByRole('button', { name: 'Установить на телефон' }))
    expect(prompt).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Установить на телефон' })).not.toBeInTheDocument()
  })
})

describe('UpdatePrompt', () => {
  it('offers a reload instead of reloading by itself', async () => {
    sw.needRefresh = true
    const { UpdatePrompt } = await import('./UpdatePrompt')
    render(<UpdatePrompt />)

    expect(screen.getByRole('status')).toHaveTextContent('Доступна новая версия')
    await userEvent.click(screen.getByRole('button', { name: 'Обновить' }))
    expect(sw.update).toHaveBeenCalledWith(true)

    await userEvent.click(screen.getByRole('button', { name: 'Позже' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    sw.needRefresh = false
  })
})
