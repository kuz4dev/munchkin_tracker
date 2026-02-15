/**
 * Base URL for API calls.
 * In production: reads VITE_API_URL (e.g. "https://munchkin-api.onrender.com").
 * In development: returns "" so paths like "/api/rooms" go through Vite dev proxy.
 */
export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL ?? ''
}

/**
 * Full WebSocket URL.
 * In production: derives from VITE_API_URL (https→wss, http→ws).
 * In development: uses window.location.host (proxied by Vite).
 */
export function getWsUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL
  if (apiUrl) {
    const wsProtocol = apiUrl.startsWith('https') ? 'wss:' : 'ws:'
    const host = apiUrl.replace(/^https?:\/\//, '')
    return `${wsProtocol}//${host}/ws`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}
