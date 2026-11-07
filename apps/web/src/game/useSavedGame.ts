import { ApiError, type SessionData } from '@munchkin/core'
import { useEffect, useState } from 'react'
import { api, gameActions } from '@/game/store'

/** How long a check may take before we explain that the server is waking up. */
export const WAKE_DELAY = 4000

/**
 * - ready: can return; also while checking, and when the server can't be
 *   reached, since the room may well be alive
 * - waking: the check is taking long, the free server is probably asleep
 * - gone: the room no longer exists
 */
export type SavedGamePhase = 'ready' | 'waking' | 'gone'

export interface SavedGame extends SessionData {
  phase: SavedGamePhase
}

/** The unfinished game this device can return to. */
export function useSavedGame() {
  const [game, setGame] = useState<SavedGame | null>(null)

  useEffect(() => {
    let active = true
    let wake: ReturnType<typeof setTimeout> | undefined
    const setPhase = (phase: SavedGamePhase) => setGame((g) => g && { ...g, phase })

    void gameActions()
      .savedGame()
      .then(async (saved) => {
        if (!active || !saved) return
        setGame({ ...saved, phase: 'ready' })
        wake = setTimeout(() => setPhase('waking'), WAKE_DELAY)
        try {
          await api.getRoomInfo(saved.roomCode)
          if (active) setPhase('ready')
        } catch (e) {
          if (!active) return
          if (e instanceof ApiError && e.notFound) {
            void gameActions().forgetSavedGame()
            setPhase('gone')
          } else {
            setPhase('ready')
          }
        } finally {
          clearTimeout(wake)
        }
      })
    return () => {
      active = false
      clearTimeout(wake)
    }
  }, [])

  return { game, clear: () => setGame(null) }
}
