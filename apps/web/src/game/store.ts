import {
  createApi,
  createConnection,
  createGameStore,
  createKeyValueSessionStorage,
  createMemorySessionStorage,
  webSocketUrl,
  type GameActions,
  type GameState,
  type SessionStorage,
} from '@munchkin/core'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

// In development the Vite proxy serves /api and /ws from the same origin.
const apiUrl = import.meta.env.VITE_API_URL ?? ''

function browserSessionStorage(): SessionStorage {
  try {
    return createKeyValueSessionStorage(window.localStorage)
  } catch {
    // Storage blocked (privacy settings): the session lasts until reload
    return createMemorySessionStorage()
  }
}

export const api = createApi(apiUrl)
export const connection = createConnection(webSocketUrl(apiUrl || window.location.origin))

/** One game at a time per tab, so the store is a module singleton. */
export const gameStore = createGameStore({ connection, api, session: browserSessionStorage() })

type Game = GameState & GameActions

export function useGame<T>(selector: (s: Game) => T): T {
  return useStore(gameStore, selector)
}

/** For selectors that build new arrays/objects: re-renders only on real changes. */
export function useGameShallow<T>(selector: (s: Game) => T): T {
  return useStore(gameStore, useShallow(selector))
}

export const gameActions = (): GameActions => gameStore.getState()

// Mobile browsers suspend background tabs and drop the socket: reconnect as
// soon as the page is visible again instead of waiting out the backoff.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') connection.reconnectNow()
})
