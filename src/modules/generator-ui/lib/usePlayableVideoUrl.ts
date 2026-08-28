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
//
// Cache model:
//   - On SUCCESS the resolved URL is cached so subsequent components with the
//     same src get it instantly.
//   - On FAILURE the src is NOT cached. The error is stored so the caller can
//     render a failure state, and a later retry (via reload()) will re-attempt
//     with fresh tokens. This prevents a broken raw URL from being cached and
//     handed back forever, which was the root cause of permanently blank cards.

import { useEffect, useState } from "react";
import {
  proxiedVideoUrl,
  proxiedThumbnailUrl,
  SIGNED_URL_TTL_SECONDS,
} from "./proxiedVideoUrl";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

// Thumbnails are signed URLs and therefore expire. The video cache handles this
// by having callers invoke invalidatePlayableVideoUrl() on a playback error, but
// a poster has no error path to hang that on — a stale <img> just fails
// silently. So cache posters with an expiry and treat an aged entry as a miss.
// The margin keeps us from handing out a URL that dies moments later.
const THUMBNAIL_TTL_MS = (SIGNED_URL_TTL_SECONDS - 5 * 60) * 1000;
const thumbnailCache = new Map<string, { url: string; expiresAt: number }>();

function readThumbnailCache(src: string): string | undefined {
  const hit = thumbnailCache.get(src);
  if (!hit) return undefined;
  if (Date.now() >= hit.expiresAt) {
    thumbnailCache.delete(src);
    return undefined;
  }
  return hit.url;
}

/**
 * Drop a resolved URL from the cache so the next resolve() re-runs the proxy
 * with a fresh access token. Called when <video> playback fails on a proxied
 * URL whose embedded token has likely expired — without this the stale URL
 * would be handed back forever and the card would stay blank.
 */
export function invalidatePlayableVideoUrl(src: string | null | undefined): void {
  if (!src) return;
  cache.delete(src);
  inflight.delete(src);
}

/**
 * Drop a resolved thumbnail URL from the cache so the next resolve() re-signs
 * with a fresh token. Called when a poster <img> fails to load because its
 * embedded signed-URL token has expired.
 */
export function invalidatePlayableThumbnailUrl(src: string | null | undefined): void {
  if (!src) return;
  thumbnailCache.delete(src);
}

function resolve(src: string): Promise<string> {
  if (!src) return Promise.resolve(src);
  if (src.startsWith("blob:") || src.startsWith("data:")) return Promise.resolve(src);
  const cached = cache.get(src);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(src);
  if (existing) return existing;
  const p = proxiedVideoUrl(src)
    .then((u) => {
      cache.set(src, u);
      inflight.delete(src);
      return u;
    })
    .catch((err) => {
      // Do NOT cache the failure — caching the raw src would hand back a
      // broken URL forever. Just clear the inflight so a retry can re-attempt.
      inflight.delete(src);
      throw err;
    });
  inflight.set(src, p);
  return p;
}

export function usePlayableVideoUrl(src: string | null | undefined): {
  url: string | undefined;
  loading: boolean;
  error: boolean;
  reload: () => void;
} {
  const initial =
    src && (src.startsWith("blob:") || src.startsWith("data:") || cache.has(src))
      ? cache.get(src) ?? src
      : undefined;
  const [url, setUrl] = useState<string | undefined>(initial);
  const [error, setError] = useState<boolean>(false);
  // Bumped to force a fresh resolve() after invalidating a stale (expired
  // token) proxy URL.
  const [reloadNonce, setReloadNonce] = useState(0);

  const reload = () => {
    invalidatePlayableVideoUrl(src);
    setError(false);
    setReloadNonce((n) => n + 1);
  };

  useEffect(() => {
    if (!src) {
      setUrl(undefined);
      setError(false);
      return;
    }
    if (src.startsWith("blob:") || src.startsWith("data:")) {
      setUrl(src);
      setError(false);
      return;
    }
    const cached = cache.get(src);
    if (cached) {
      setUrl(cached);
      setError(false);
      return;
    }
    let cancelled = false;
    setUrl(undefined);
    setError(false);
    resolve(src)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src, reloadNonce]);

  return { url, loading: !!src && !url && !error, error, reload };
}

/**
 * Resolve a poster/thumbnail URL for a private bucket via `proxiedThumbnailUrl`.
 * Returns `{ url, reload }` where `url` is `undefined` (no poster) on failure —
 * a missing poster is acceptable, unlike a broken video. Successful resolutions
 * are cached in-memory with a TTL shorter than the signed-URL TTL so an expired
 * signed URL is never handed back. `reload()` invalidates the cache entry and
 * forces a fresh re-sign (used by the poster <img> onError recovery).
 */
export function usePlayableThumbnailUrl(
  src: string | null | undefined,
): { url: string | undefined; reload: () => void } {
  const [reloadNonce, setReloadNonce] = useState(0);

  const [url, setUrl] = useState<string | undefined>(() => {
    if (!src) return undefined;
    if (src.startsWith("blob:") || src.startsWith("data:")) return src;
    return readThumbnailCache(src);
  });

  const reload = () => {
    invalidatePlayableThumbnailUrl(src);
    setReloadNonce((n) => n + 1);
  };

  useEffect(() => {
    if (!src) {
      setUrl(undefined);
      return;
    }
    if (src.startsWith("blob:") || src.startsWith("data:")) {
      setUrl(src);
      return;
    }
    const cached = readThumbnailCache(src);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    proxiedThumbnailUrl(src)
      .then((u) => {
        if (cancelled) return;
        if (u) thumbnailCache.set(src, { url: u, expiresAt: Date.now() + THUMBNAIL_TTL_MS });
        setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setUrl(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [src, reloadNonce]);

  return { url, reload };
}

export function usePlayableVideoUrls(srcs: Array<string | null | undefined>): {
  urls: Array<string | undefined>;
  loading: boolean;
  errors: Array<boolean>;
} {
  const key = srcs.map((s) => s ?? "").join("|");
  const [urls, setUrls] = useState<Array<string | undefined>>(() =>
    srcs.map((s) => {
      if (!s) return undefined;
      if (s.startsWith("blob:") || s.startsWith("data:")) return s;
      return cache.get(s);
    }),
  );
  const [errors, setErrors] = useState<Array<boolean>>(() => srcs.map(() => false));

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      srcs.map((s) =>
        s
          ? resolve(s).then(
              (u) => u,
              () => undefined as unknown as string,
            )
          : Promise.resolve(undefined as unknown as string),
      ),
    ).then((res) => {
      if (cancelled) return;
      setUrls(res.map((u, i) => (srcs[i] ? u : undefined)));
      setErrors(res.map((u, i) => !!srcs[i] && u === undefined));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    urls,
    loading: urls.some((u, i) => !!srcs[i] && !u && !errors[i]),
    errors,
  };
}