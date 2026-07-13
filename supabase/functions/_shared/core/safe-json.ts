// Safe JSON reader for upstream responses.
//
// Why this exists:
// Every caller in this repo already guards `if (!res.ok)`, but that is not enough.
// Gateways, proxies, CDNs and tunnels can answer with HTTP 200 and an HTML body
// (maintenance page, WAF interstitial, tunnel error page). Calling `res.json()`
// on that throws `SyntaxError: Unexpected token '<', "<html>..."`, which bubbles
// up and surfaces to the user as an opaque 500 RUNTIME_ERROR.
//
// readJsonSafe() never throws. It returns a discriminated union so the caller can
// return a clean 502 instead of crashing.

export type SafeJson<T> =
  | { ok: true; data: T }
  | { ok: false; raw: string; contentType: string };

export async function readJsonSafe<T = unknown>(res: Response): Promise<SafeJson<T>> {
  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text().catch(() => "");
  const trimmed = raw.trim();

  // Empty body.
  if (!trimmed) {
    return { ok: false, raw: "", contentType };
  }

  // Body looks like HTML (e.g. "<html>", "<!DOCTYPE html>").
  if (trimmed.startsWith("<")) {
    return { ok: false, raw: trimmed, contentType };
  }

  try {
    return { ok: true, data: JSON.parse(trimmed) as T };
  } catch {
    return { ok: false, raw: trimmed, contentType };
  }
}

// Convenience: short, log-safe preview of a bad body (never dump a whole HTML page).
export function previewBody(raw: string, max = 200): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

// Loose variant: returns the parsed body, or null if the upstream did not send JSON.
// Never throws. Callers already guard for empty/!content and return a clean 502,
// so returning null degrades gracefully instead of crashing with a 500.
// Defaults to `any` so call sites keep the exact typing they had with `res.json()`.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJsonLoose<T = any>(res: Response, label = "upstream"): Promise<T | null> {
  const result = await readJsonSafe<T>(res);
  if (result.ok) return result.data;
  console.error(`${label}: non-JSON response`, {
    status: res.status,
    contentType: result.contentType,
    body: previewBody(result.raw),
  });
  return null;
}
