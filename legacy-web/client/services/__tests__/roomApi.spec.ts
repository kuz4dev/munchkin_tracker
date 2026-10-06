import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoom, getRoomInfo } from '../roomApi'

describe('roomApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('createRoom', () => {
    it('sends POST to /api/rooms and returns room info', async () => {
      const mockResponse = { code: 'ABC123', playerCount: 0 }
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      const result = await createRoom()

      expect(fetch).toHaveBeenCalledWith('/api/rooms', { method: 'POST' })
      expect(result).toEqual(mockResponse)
    })

    it('throws on non-OK response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        }),
      )

      await expect(createRoom()).rejects.toThrow('Failed to create room: 500')
    })
  })

  describe('getRoomInfo', () => {
    it('sends GET to /api/rooms/{code} and returns room info', async () => {
      const mockResponse = { code: 'XYZ789', playerCount: 3 }
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      const result = await getRoomInfo('XYZ789')

      expect(fetch).toHaveBeenCalledWith('/api/rooms/XYZ789')
      expect(result).toEqual(mockResponse)
    })

    it('encodes room code in URL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ code: 'A B', playerCount: 0 }),
        }),
      )

      await getRoomInfo('A B')

      expect(fetch).toHaveBeenCalledWith('/api/rooms/A%20B')
    })

    it('throws on 404 response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
        }),
      )

      await expect(getRoomInfo('INVALID')).rejects.toThrow('Failed to get room info: 404')
    })
  })
})
