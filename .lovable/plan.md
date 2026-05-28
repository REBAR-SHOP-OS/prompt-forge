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
## Phase 4 — TODO (durable rate limiting)
## Phase 5 — TODO (job lifecycle / RLS review)
## Phase 6 — TODO (frontend reliability)

Awaiting user signal to proceed with Phase 2.
