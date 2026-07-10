/**
 * Allow only safe media URL schemes before binding to an <img>/<video> src.
 * Breaks XSS-through-DOM flows while permitting the real cases: remote http(s)
 * assets, in-memory object URLs (blob:), and inline data: previews.
 */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "blob:", "data:"]);

export function safeMediaUrl(url: string | null | undefined): string | undefined {
  const raw = typeof url === 'string' ? url.trim() : ''
  if (!raw) return undefined
  try {
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost'
    const parsed = new URL(raw, base)
    return SAFE_PROTOCOLS.has(parsed.protocol) ? raw : undefined
  } catch {
    return undefined
  }
}
