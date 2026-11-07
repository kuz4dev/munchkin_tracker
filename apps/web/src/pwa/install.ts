import { useSyncExternalStore } from 'react'

// Chrome/Android/desktop Chromium fire this when the app can be installed.
// It can fire before React mounts, so it is captured at module load.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // we show our own button instead of the mini-infobar
  deferred = e as BeforeInstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  installed = true
  notify()
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opens the browser's install dialog, if one is available right now. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (!event) return false
  deferred = null
  notify()
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}

export function useCanInstall(): boolean {
  return useSyncExternalStore(subscribe, () => deferred !== null)
}

/** The browser reported that the installation has finished. */
export function useInstalled(): boolean {
  return useSyncExternalStore(subscribe, () => installed)
}

/** Already running as an installed app (home-screen icon). */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * iOS has no install prompt: installing is manual, from the Share menu. Safari
 * always offers it there; Chrome and Edge do since iOS 16.4.
 */
export function canAddToHomeScreenOnIos(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints): boolean {
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && touchPoints > 1)
  if (!ios || !/Safari/.test(ua)) return false
  if (/FxiOS/.test(ua)) return false
  if (!/CriOS|EdgiOS/.test(ua)) return true
  const version = /OS (\d+)[_.](\d+)/.exec(ua)
  if (!version) return false
  const [major, minor] = [Number(version[1]), Number(version[2])]
  return major > 16 || (major === 16 && minor >= 4)
}
