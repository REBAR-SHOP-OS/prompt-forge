/**
 * Allow only safe media URL schemes before binding to an <img>/<video> src.
 * Permits the real cases used by the UI: remote http(s) assets and
 * in-memory object URLs (blob:).
 */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "blob:"]);

function isSafeImageDataUrl(raw: string): boolean {
  const match = raw.match(/^data:([^;,]+)[;,]/i)
  if (!match) return false
  const mime = match[1].trim().toLowerCase()
  return mime.startsWith('image/')
}

export function safeMediaUrl(url: string | null | undefined): string | undefined {
  const raw = typeof url === 'string' ? url.trim() : ''
  if (!raw) return undefined
  try {
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost'
    const parsed = new URL(raw, base)
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) return undefined
    if (parsed.protocol === 'data:' && !isSafeImageDataUrl(raw)) return undefined
    return parsed.href
  } catch {
    return undefined
  }
}
