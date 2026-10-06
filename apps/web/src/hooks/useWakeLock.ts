import { useEffect } from 'react'

/**
 * Keeps the screen on while `active` (during a game, phones lie on the table
 * between turns). The browser drops the lock when the tab is hidden, so it is
 * requested again whenever the page becomes visible. Unsupported browsers
 * simply keep their normal screen timeout.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    async function request() {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) void lock.release()
        else sentinel = lock
      } catch {
        // Denied (battery saver, permissions policy): not essential
      }
    }

    void request()
    document.addEventListener('visibilitychange', request)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', request)
      void sentinel?.release()
    }
  }, [active])
}
