# Hardening progress

## Phase 1 — DONE (partial scope, see notes)

- `supabase/functions/_shared/core/http.ts`: added `getCorsHeaders(req)` + `isAllowedOrigin()` with env `ALLOWED_APP_ORIGINS` (comma-separated) plus a built-in allowlist for `*.lovable.app`, `*.lovableproject.com`, `*.sandbox.lovable.dev`, and `localhost`. Legacy static `corsHeaders` kept for backwards-compat.
- `supabase/functions/video-proxy/index.ts`: migrated all responses to allowlist-aware `cors(req)`. Expose-Headers trimmed to `Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag` only.
- `supabase/functions/tts-generate/index.ts`, `supabase/functions/day-info/index.ts`: migrated to allowlist helper.
- `src/core/config/env.ts`: new validated public env surface. Auto-generated `client.ts` left untouched (anon key is publishable-by-design). Provides `getEnvConfigError()` for future controlled error screen.
- Log audit: existing logs already structured (`{requestId, error.message}`) — no secrets/tokens/signed URLs found in logs.

### Not yet migrated (will sweep in a later pass)

The remaining edge functions still use the legacy static `corsHeaders` (= `*`). Since auth is Bearer-in-Authorization-header (localStorage, not cookies), `*` is not a CSRF vector. Migration of the rest will happen alongside Phase 4 (rate-limit) which already requires touching each function.

## Phase 2 — TODO (video-proxy token hardening)
## Phase 3 — TODO (upload/asset ownership validation)
## Phase 2 — DONE (video-proxy token hardening)

- New `supabase/functions/_shared/core/proxyToken.ts`: HMAC-SHA256 signed token `v1.<payload>.<sig>` with payload `{u, h(=sha256(url)), e, p="video_proxy"}`. Signing key derived from `SUPABASE_SERVICE_ROLE_KEY` (domain-separated via `video-proxy/v1|...`), with optional `VIDEO_PROXY_HMAC_SECRET` override. Constant-time URL-hash compare.
- New edge function `video-proxy-token`: POST `{url}` with valid Supabase access token → `{token, expiresAt}`. Validates host allowlist (aliyuncs.com, supabase.co/in), protocol, and URL shape. 1h TTL.
- `video-proxy/index.ts`: removed Supabase JWT acceptance from query string. Now requires `?pt=<token>&url=<target>` and verifies the HMAC token is bound to the exact target URL. Range/HEAD behavior preserved.
- `proxiedVideoUrl.ts`: calls mint endpoint with Bearer auth; caches minted tokens in-memory with 5-min safety margin; falls back to raw URL if unauthenticated.
- `usePlayableVideoUrl.ts`: resolved-URL cache now has 50-min TTL so embedded tokens never go stale beyond the server-side 1h expiry.
- `supabase/config.toml`: registered `video-proxy-token` with `verify_jwt = false` (we auth in-code).
- Verified end-to-end: valid token → 200/upstream-pass; token reused for different URL → 401; non-allowed host → 400; invalid auth on mint → 401.


## Phase 5 — TODO (job lifecycle / RLS review)
## Phase 6 — TODO (frontend reliability)

Awaiting user signal to proceed with Phase 2.
