import { describe, expect, it } from 'vitest'
import { createKeyValueSessionStorage, createMemorySessionStorage, parseSession } from '../session'

describe('session storage', () => {
  it('round-trips', async () => {
    const s = createMemorySessionStorage()
    expect(await s.load()).toBeNull()
    await s.save({ roomCode: 'ABC234', playerName: 'Alice', sessionId: 'x' })
    expect(await s.load()).toEqual({ roomCode: 'ABC234', playerName: 'Alice', sessionId: 'x' })
    await s.clear()
    expect(await s.load()).toBeNull()
  })

  it('treats malformed data as no session', () => {
    expect(parseSession('not json')).toBeNull()
    expect(parseSession('{"roomCode":"A","playerName":"B"}')).toBeNull()
    expect(parseSession('{"roomCode":1,"playerName":"B","sessionId":"c"}')).toBeNull()
    expect(parseSession(null)).toBeNull()
  })

  it('survives a storage that throws (private mode, quota)', async () => {
    const broken = createKeyValueSessionStorage({
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    })
    await expect(broken.save({ roomCode: 'A', playerName: 'B', sessionId: 'C' })).resolves.toBeUndefined()
    await expect(broken.load()).resolves.toBeNull()
    await expect(broken.clear()).resolves.toBeUndefined()
  })
})
