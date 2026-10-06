import {
  createApi,
  createConnection,
  createGameStore,
  webSocketUrl,
  type GameActions,
  type GameState,
} from '@munchkin/core'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { resolveApiUrl } from './config'
import { sessionStorage } from './session'

const apiUrl = resolveApiUrl()

export const api = createApi(apiUrl)
export const connection = createConnection(webSocketUrl(apiUrl))

/** One game at a time per device, so the store is a module singleton. */
export const gameStore = createGameStore({ connection, api, session: sessionStorage })

type Game = GameState & GameActions

export function useGame<T>(selector: (s: Game) => T): T {
  return useStore(gameStore, selector)
}

/** For selectors that build new arrays/objects: re-renders only on real changes. */
export function useGameShallow<T>(selector: (s: Game) => T): T {
  return useStore(gameStore, useShallow(selector))
}

export const gameActions = (): GameActions => gameStore.getState()
