/**
 * Chunked Uint8Array -> base64. Avoids the O(n) string-concatenation-per-byte
 * loop that burned CPU on multi-megabyte reference images. Uses only `btoa`
 * and `String.fromCharCode`, available in Deno and browsers.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // 32 KiB keeps apply() argument count safe
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK))));
  }
  return btoa(parts.join(""));
}

/**
 * Request-scoped memoizing resolver: each distinct reference URL is fetched and
 * encoded at most once per request, then reused for every generation and
 * evaluation attempt. The in-flight promise is cached so concurrent callers
 * share one fetch.
 */
export function createReferenceResolver(
  resolve: (url: string) => Promise<string>,
): (url: string) => Promise<string> {
  const cache = new Map<string, Promise<string>>();
  return (url: string) => {
    let hit = cache.get(url);
    if (!hit) {
      hit = resolve(url);
      cache.set(url, hit);
    }
    return hit;
  };
}
