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
  function offerInstall(outcome: 'accepted' | 'dismissed') {
    const prompt = vi.fn(async () => {})
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome }),
    })
    act(() => {
      window.dispatchEvent(event)
    })
    return { event, prompt }
  }

  async function freshHint() {
    vi.resetModules() // the install state lives in the module
    const { InstallHint } = await import('./InstallHint')
    render(<InstallHint />)
  }

  it('shows the button once the browser allows it, then follows the installation', async () => {
    await freshHint()
    expect(screen.queryByRole('button', { name: 'Установить на телефон' })).not.toBeInTheDocument()

    const { event, prompt } = offerInstall('accepted')
    expect(event.defaultPrevented).toBe(true) // our button instead of the mini-infobar

    await userEvent.click(screen.getByRole('button', { name: 'Установить на телефон' }))
    expect(prompt).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Установить на телефон' })).not.toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Устанавливается')
    expect(screen.getByRole('status')).toHaveTextContent('выключите VPN')

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(screen.getByRole('status')).toHaveTextContent('Готово! Ищите «Манчкин»')
    expect(screen.getByRole('status')).not.toHaveTextContent('Устанавливается')
  })

  it('the "installed" toast goes away by itself', async () => {
    vi.resetModules()
    const { InstallHint } = await import('./InstallHint')
    vi.useFakeTimers()
    try {
      render(<InstallHint />)
      act(() => {
        window.dispatchEvent(new Event('appinstalled'))
      })
      expect(screen.getByRole('status')).toHaveTextContent('Готово!')
      act(() => {
        vi.advanceTimersByTime(3999)
      })
      expect(screen.getByRole('status')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('says how to install later after a refusal, and brings the button back when the browser allows', async () => {
    await freshHint()
    offerInstall('dismissed')
    await userEvent.click(screen.getByRole('button', { name: 'Установить на телефон' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Установка отменена')

    offerInstall('accepted')
    expect(screen.getByRole('button', { name: 'Установить на телефон' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('add to Home Screen on iOS', () => {
  const iphone = (os: string, browser: string) =>
    `Mozilla/5.0 (iPhone; CPU iPhone OS ${os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${browser} Mobile/15E148 Safari/604.1`
  const check = async (ua: string, touch = 5) => (await import('./install')).canAddToHomeScreenOnIos(ua, touch)

  it('works in Safari on any version', async () => {
    expect(await check(iphone('15_0', 'Version/15.0'))).toBe(true)
    expect(await check(iphone('18_1', 'Version/18.1'))).toBe(true)
  })

  it('works in Chrome and Edge since iOS 16.4', async () => {
    expect(await check(iphone('16_4', 'CriOS/120.0'))).toBe(true)
    expect(await check(iphone('17_0', 'EdgiOS/120.0'))).toBe(true)
    expect(await check(iphone('16_3', 'CriOS/110.0'))).toBe(false)
    expect(await check(iphone('15_7', 'EdgiOS/110.0'))).toBe(false)
  })

  it('is not offered elsewhere', async () => {
    expect(await check(iphone('18_0', 'FxiOS/120.0'))).toBe(false)
    expect(await check('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')).toBe(false)
    expect(await check('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 0)).toBe(false)
    expect(await check('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 5)).toBe(true) // iPad
    expect(await check('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Telegram')).toBe(false) // in-app browser
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
