/** Link that opens the home page with the room code prefilled. */
export function inviteLink(code: string): string {
  return `${window.location.origin}/room/${encodeURIComponent(code)}`
}

/**
 * Copies text to the clipboard. The Clipboard API exists only in secure
 * contexts (HTTPS, localhost), so plain-HTTP pages (e.g. a phone opening the
 * dev server by IP) fall back to the legacy copy command.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // denied or unavailable: try the fallback
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  // Keep it out of sight and avoid zooming/scrolling on iOS
  area.style.position = 'fixed'
  area.style.opacity = '0'
  area.style.fontSize = '16px'
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

/** Opens the system share sheet where available (phones), otherwise copies the link. */
export async function shareInvite(code: string): Promise<ShareResult> {
  const url = inviteLink(code)
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Манчкин Трекер', text: `Заходи в игру! Код комнаты: ${code}`, url })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // share failed for another reason: fall back to copying
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed'
}
