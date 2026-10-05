import type { ChangeLogEntry } from './protocol'

export interface RoomInfo {
  code: string
  playerCount: number
}

export interface EventsPage {
  /** Oldest first */
  events: ChangeLogEntry[]
  hasMore: boolean
}

/** An HTTP error from the API; status 0 means the server couldn't be reached. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get notFound() {
    return this.status === 404
  }

  get rateLimited() {
    return this.status === 429
  }
}

export interface Api {
  createRoom(): Promise<RoomInfo>
  getRoomInfo(code: string): Promise<RoomInfo>
  /** Loads up to `limit` events with seq < before. */
  getRoomEvents(code: string, before: number, limit?: number): Promise<EventsPage>
}

export function createApi(baseUrl: string, fetchImpl: typeof fetch = (...args) => fetch(...args)): Api {
  const base = baseUrl.replace(/\/$/, '')

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetchImpl(base + path, init)
    } catch {
      throw new ApiError('Сервер недоступен', 0)
    }
    if (!res.ok) {
      throw new ApiError(`Request failed: ${res.status}`, res.status)
    }
    return (await res.json()) as T
  }

  const room = (code: string) => `/api/rooms/${encodeURIComponent(code)}`

  return {
    createRoom: () => request<RoomInfo>('/api/rooms', { method: 'POST' }),
    getRoomInfo: (code) => request<RoomInfo>(room(code)),
    getRoomEvents: (code, before, limit = 50) =>
      request<EventsPage>(`${room(code)}/events?before=${before}&limit=${limit}`),
  }
}
