/**
 * Allow only safe media URL schemes before binding to an <img>/<video> src.
 * Breaks XSS-through-DOM flows while permitting the real cases: remote http(s)
 * assets, in-memory object URLs (blob:), and inline data: previews.
 */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "blob:", "data:"]);

export function safeMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, typeof location !== "undefined" ? location.href : "http://localhost");
    return SAFE_PROTOCOLS.has(parsed.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}
