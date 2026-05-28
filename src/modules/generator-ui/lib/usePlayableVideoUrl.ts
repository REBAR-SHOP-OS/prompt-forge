// Resolves a (possibly external) video URL into a same-origin, CORS-safe URL
// suitable for <video src=...>. Uses the existing video-proxy edge function
// via `proxiedVideoUrl`. Caches results in-memory across components so a
// given source URL is only resolved once per session.
//
// Behavior:
//   - blob: / data: URLs are returned unchanged immediately.
//   - same-origin / own Supabase storage host URLs are returned unchanged.
//   - external URLs (e.g. Aliyun OSS) are routed through the auth-checked
//     proxy and the resolved URL is returned once ready.
//   - while resolving, returns { url: undefined, loading: true } so callers
//     can render a loading state instead of a broken/grey <video>.

import { useEffect, useState } from "react";
import { proxiedVideoUrl } from "./proxiedVideoUrl";

// Resolved URLs embed a short-lived HMAC proxy token (~1h server-side TTL).
// Cache them for slightly less so we re-mint before the token expires.
const CACHE_TTL_MS = 50 * 60 * 1000;
interface Entry { url: string; expiresAt: number }
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<string>>();

function readCache(src: string): string | undefined {
  const e = cache.get(src);
  if (!e) return undefined;
  if (e.expiresAt <= Date.now()) {
    cache.delete(src);
    return undefined;
  }
  return e.url;
}

function resolve(src: string): Promise<string> {
  if (!src) return Promise.resolve(src);
  if (src.startsWith("blob:") || src.startsWith("data:")) return Promise.resolve(src);
  const cached = readCache(src);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(src);
  if (existing) return existing;
  const p = proxiedVideoUrl(src)
    .then((u) => {
      cache.set(src, { url: u, expiresAt: Date.now() + CACHE_TTL_MS });
      inflight.delete(src);
      return u;
    })
    .catch(() => {
      inflight.delete(src);
      cache.set(src, { url: src, expiresAt: Date.now() + 60_000 });
      return src;
    });
  inflight.set(src, p);
  return p;
}
  url: string | undefined;
  loading: boolean;
} {
  const initial =
    src && (src.startsWith("blob:") || src.startsWith("data:") || cache.has(src))
      ? cache.get(src) ?? src
      : undefined;
  const [url, setUrl] = useState<string | undefined>(initial);

  useEffect(() => {
    if (!src) {
      setUrl(undefined);
      return;
    }
    if (src.startsWith("blob:") || src.startsWith("data:")) {
      setUrl(src);
      return;
    }
    const cached = cache.get(src);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    setUrl(undefined);
    resolve(src).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return { url, loading: !!src && !url };
}

export function usePlayableVideoUrls(srcs: Array<string | null | undefined>): {
  urls: Array<string | undefined>;
  loading: boolean;
} {
  const key = srcs.map((s) => s ?? "").join("|");
  const [urls, setUrls] = useState<Array<string | undefined>>(() =>
    srcs.map((s) => {
      if (!s) return undefined;
      if (s.startsWith("blob:") || s.startsWith("data:")) return s;
      return cache.get(s);
    }),
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all(srcs.map((s) => (s ? resolve(s) : Promise.resolve(undefined as unknown as string)))).then((res) => {
      if (cancelled) return;
      setUrls(res.map((u, i) => (srcs[i] ? u : undefined)));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { urls, loading: urls.some((u, i) => !!srcs[i] && !u) };
}
