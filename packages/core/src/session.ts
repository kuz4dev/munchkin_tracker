/** What a device remembers to get back into its game after a restart. */
export interface SessionData {
  roomCode: string
  playerName: string
  /** Secret reconnect token issued by the server */
  sessionId: string
}

/** Async so it can be backed by the iOS Keychain / Android Keystore. */
export interface SessionStorage {
  load(): Promise<SessionData | null>
  save(data: SessionData): Promise<void>
  clear(): Promise<void>
}

export const SESSION_KEY = 'munchkin_session'

/** Validates stored session JSON; anything malformed counts as no session. */
export function parseSession(raw: string | null | undefined): SessionData | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Partial<SessionData>
    if (
      typeof data.roomCode === 'string' && data.roomCode &&
      typeof data.playerName === 'string' && data.playerName &&
      typeof data.sessionId === 'string' && data.sessionId
    ) {
      return { roomCode: data.roomCode, playerName: data.playerName, sessionId: data.sessionId }
    }
  } catch {
    // fall through
  }
  return null
}

/** Session storage over a synchronous key-value store (e.g. localStorage). */
export function createKeyValueSessionStorage(kv: {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}): SessionStorage {
  // Storage can throw (private mode, quota, disabled cookies): never fatal
  return {
    async load() {
      try {
        return parseSession(kv.getItem(SESSION_KEY))
      } catch {
        return null
      }
    },
    async save(data) {
      try {
        kv.setItem(SESSION_KEY, JSON.stringify(data))
      } catch {
        // ignore
      }
    },
    async clear() {
      try {
        kv.removeItem(SESSION_KEY)
      } catch {
        // ignore
      }
    },
  }
}

export function createMemorySessionStorage(): SessionStorage {
  const map = new Map<string, string>()
  return createKeyValueSessionStorage({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  })
}
