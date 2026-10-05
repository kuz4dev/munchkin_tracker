import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApi } from '../api'

function respond(status: number, body: unknown = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }))
}

describe('createApi', () => {
  it('creates a room with POST', async () => {
    const fetch = respond(200, { code: 'ABC234', playerCount: 0 })
    const api = createApi('https://api.test/', fetch)
    expect(await api.createRoom()).toEqual({ code: 'ABC234', playerCount: 0 })
    expect(fetch).toHaveBeenCalledWith('https://api.test/api/rooms', { method: 'POST' })
  })

  it('encodes the room code', async () => {
    const fetch = respond(200, { code: 'A', playerCount: 1 })
    await createApi('', fetch).getRoomInfo('A/B C')
    expect(fetch).toHaveBeenCalledWith('/api/rooms/A%2FB%20C', undefined)
  })

  it('pages events', async () => {
    const fetch = respond(200, { events: [], hasMore: false })
    await createApi('', fetch).getRoomEvents('ABC234', 51, 20)
    expect(fetch).toHaveBeenCalledWith('/api/rooms/ABC234/events?before=51&limit=20', undefined)
  })

  it('turns HTTP errors into ApiError', async () => {
    const err = await createApi('', respond(404)).getRoomInfo('X').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.notFound).toBe(true)
    const limited = await createApi('', respond(429)).createRoom().catch((e) => e)
    expect(limited.rateLimited).toBe(true)
  })

  it('reports an unreachable server as status 0', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Network request failed')
    })
    const err = await createApi('', fetch).createRoom().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
  })
})
