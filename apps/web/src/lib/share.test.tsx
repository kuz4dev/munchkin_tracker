import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoomHeader } from '@/components/RoomHeader'
import { copyText, inviteLink, shareInvite } from './share'

function stubNavigator(props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { value, configurable: true })
  }
}

function stubExecCommand(result: boolean) {
  const exec = vi.fn(() => result)
  Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
  return exec
}

afterEach(() => {
  for (const key of ['clipboard', 'share']) Reflect.deleteProperty(navigator, key)
  Reflect.deleteProperty(document, 'execCommand')
  vi.restoreAllMocks()
})

describe('copyText', () => {
  it('uses the Clipboard API when available', async () => {
    const writeText = vi.fn(async () => {})
    stubNavigator({ clipboard: { writeText } })
    expect(await copyText('hi')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hi')
  })

  it('falls back to the copy command on plain HTTP (no Clipboard API)', async () => {
    // Regression: on a phone opening http://<ip> nothing was copied
    const exec = stubExecCommand(true)
    expect(await copyText('hi')).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull() // cleaned up
  })

  it('falls back when the Clipboard API refuses', async () => {
    stubNavigator({ clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) } })
    stubExecCommand(true)
    expect(await copyText('hi')).toBe(true)
  })

  it('reports failure when nothing works', async () => {
    stubExecCommand(false)
    expect(await copyText('hi')).toBe(false)
  })
})

describe('shareInvite', () => {
  it('opens the share sheet with the invite link', async () => {
    const share = vi.fn(async () => {})
    stubNavigator({ share })
    expect(await shareInvite('ABC234')).toBe('shared')
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: inviteLink('ABC234') }))
    expect(inviteLink('ABC234')).toMatch(/\/room\/ABC234$/)
  })

  it('treats closing the share sheet as cancelled', async () => {
    stubNavigator({ share: vi.fn(async () => Promise.reject(new DOMException('no', 'AbortError'))) })
    expect(await shareInvite('ABC234')).toBe('cancelled')
  })

  it('copies the link where sharing is unavailable or fails', async () => {
    const writeText = vi.fn(async () => {})
    stubNavigator({ clipboard: { writeText } })
    expect(await shareInvite('ABC234')).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(inviteLink('ABC234'))

    stubNavigator({ share: vi.fn(async () => Promise.reject(new TypeError('not allowed'))) })
    expect(await shareInvite('ABC234')).toBe('copied')
  })
})

describe('RoomHeader', () => {
  it('copies the invite link and says so', async () => {
    const writeText = vi.fn(async () => {})
    stubNavigator({ clipboard: { writeText } })
    render(<RoomHeader code="ABC234" connected onLeave={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: /Скопировать ссылку/ }))
    expect(writeText).toHaveBeenCalledWith(inviteLink('ABC234'))
    expect(screen.getByRole('status')).toHaveTextContent('Ссылка на комнату скопирована')
  })

  it('shows the code when copying is impossible', async () => {
    stubExecCommand(false)
    render(<RoomHeader code="ABC234" connected onLeave={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Скопировать ссылку/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Не удалось скопировать. Код комнаты: ABC234')
  })
})
