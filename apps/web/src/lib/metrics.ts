import { apiUrl } from '@/game/store'

/** Anonymous counters (see server/internal/api/metrics.go): no ids, no cookies. */
export type MetricEvent = 'visit' | 'launch_installed' | 'install_click' | 'install_accepted' | 'invite'

/** Counts an event. Fire-and-forget: never throws, never delays the UI. */
export function track(event: MetricEvent): void {
  if (import.meta.env.MODE === 'test') return
  const url = `${apiUrl}/api/metrics`
  // A string body goes as text/plain: a simple request without a CORS preflight
  const body = JSON.stringify({ event })
  try {
    if (navigator.sendBeacon?.(url, body)) return
    void fetch(url, { method: 'POST', body, keepalive: true }).catch(() => {})
  } catch {
    // analytics must never break the app
  }
}
