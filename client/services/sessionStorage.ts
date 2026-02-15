export interface SessionData {
  roomCode: string
  playerName: string
  sessionId: string
}

const STORAGE_KEY = 'munchkin_session'

export function saveSession(data: SessionData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function loadSession(): SessionData | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as SessionData
    if (data.roomCode && data.playerName && data.sessionId) {
      return data
    }
    return null
  } catch {
    return null
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY)
}
