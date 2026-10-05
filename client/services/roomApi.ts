import { getApiBaseUrl } from './config'
import type { ChangeLogEntry } from '@/types'

export interface RoomInfo {
  code: string
  playerCount: number
}

export async function createRoom(): Promise<RoomInfo> {
  const res = await fetch(`${getApiBaseUrl()}/api/rooms`, { method: 'POST' })
  if (!res.ok) {
    throw new Error(`Failed to create room: ${res.status}`)
  }
  return res.json() as Promise<RoomInfo>
}

export interface EventsPage {
  /** Oldest first */
  events: ChangeLogEntry[]
  hasMore: boolean
}

/** Loads up to `limit` events with seq < before. */
export async function getRoomEvents(code: string, before: number, limit = 50): Promise<EventsPage> {
  const params = new URLSearchParams({ before: String(before), limit: String(limit) })
  const res = await fetch(`${getApiBaseUrl()}/api/rooms/${encodeURIComponent(code)}/events?${params}`)
  if (!res.ok) {
    throw new Error(`Failed to load events: ${res.status}`)
  }
  return res.json() as Promise<EventsPage>
}

export async function getRoomInfo(code: string): Promise<RoomInfo> {
  const res = await fetch(`${getApiBaseUrl()}/api/rooms/${encodeURIComponent(code)}`)
  if (!res.ok) {
    throw new Error(`Failed to get room info: ${res.status}`)
  }
  return res.json() as Promise<RoomInfo>
}
