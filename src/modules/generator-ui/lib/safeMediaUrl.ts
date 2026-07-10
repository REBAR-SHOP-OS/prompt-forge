/**
 * Allow only safe media URL schemes before binding to an <img>/<video> src.
 * Permits the real cases used by the UI: remote http(s) assets, in-memory
 * object URLs (blob:), and inline image data: URLs. Everything else (e.g.
 * javascript:, non-image data:) is rejected — breaks XSS-through-DOM flows.
 */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "blob:", "data:"]);

function isSafeImageDataUrl(raw: string): boolean {
  const match = raw.match(/^data:([^;,]+)[;,]/i);
  if (!match) return false;
  return match[1].trim().toLowerCase().startsWith("image/");
}

export function safeMediaUrl(url: string | null | undefined): string | undefined {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return undefined;
  try {
    const base = typeof location !== "undefined" ? location.href : "http://localhost";
    const parsed = new URL(raw, base);
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) return undefined;
    if (parsed.protocol === "data:" && !isSafeImageDataUrl(raw)) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}
