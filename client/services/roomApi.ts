export interface RoomInfo {
  code: string
  playerCount: number
}

export async function createRoom(): Promise<RoomInfo> {
  const res = await fetch('/api/rooms', { method: 'POST' })
  if (!res.ok) {
    throw new Error(`Failed to create room: ${res.status}`)
  }
  return res.json() as Promise<RoomInfo>
}

export async function getRoomInfo(code: string): Promise<RoomInfo> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`)
  if (!res.ok) {
    throw new Error(`Failed to get room info: ${res.status}`)
  }
  return res.json() as Promise<RoomInfo>
}
