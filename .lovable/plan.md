# Hardening & Stabilization Plan

This is a large, cross-cutting pass. To stay safe and non-breaking, I'll split it into **6 phases**, each independently shippable and testable. Please tell me which phase to start with (or "all in order").

---

## Phase 1 — Secrets, CORS, and logging hygiene (low risk, high value)

- Move frontend Supabase URL/anon key to `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` with runtime validation and a controlled config-error screen.
  - Note: `src/integrations/supabase/client.ts` is auto-generated — I'll add a thin wrapper that reads env, and keep the generated file untouched.
- Replace `Access-Control-Allow-Origin: *` in `_shared/core/http.ts` with an `ALLOWED_APP_ORIGINS` allowlist that echoes the request origin only when matched. Preserve OPTIONS preflight. Trim `Access-Control-Expose-Headers` on `video-proxy` to playback-only set.
- Sweep edge functions and frontend for accidental logging of tokens, signed URLs, full Authorization headers, provider keys, full prompts. Replace with `{ requestId, length }` style logs.

## Phase 2 — Video proxy token hardening

- Add `proxy_tokens` table (id, user_id, target_url_hash, expires_at, used_at) + RPC, OR an HMAC-signed token using a new edge secret `VIDEO_PROXY_HMAC_SECRET`.
- New edge function `video-proxy-token` (authenticated) that mints a 5-minute token bound to (user, exact target URL).
- `video-proxy` accepts only this short-lived token via query string; remove Supabase access token from query. Keep Range/HEAD behavior and strict allowlisted upstream hosts.
- Update `proxiedVideoUrl.ts` to call the mint endpoint and cache by URL+expiry.

## Phase 3 — Upload & asset ownership validation

- Harden `jobs-create-from-upload` + `jobs-update-edited-video`:
  - UUID validation for `jobId`.
  - Bucket allowlist + path must start with `${auth.userId}/`.
  - Server-side `storage.objects` metadata check for size/MIME.
  - Reject external URLs for user-uploaded assets.
  - On DB failure, best-effort delete of the just-uploaded object.
- Same path/ownership checks in `enhance-prompt` and `scenario-write` for image inputs.

## Phase 4 — Durable rate limiting

- New table `rate_limit_buckets(key, window_start, count)` + `rate_limit_consume(_key, _limit, _window_seconds)` RPC (atomic upsert).
- Replace in-memory limiter in `_shared/core/ratelimit.ts` with this RPC. Key by `user_id:route` (auth) or `ip:route` (anon).
- Apply to: jobs-create, jobs-get, enhance-prompt, scenario-write, tts-generate, video-analyze, video-proxy-token, upload/edit endpoints. Return consistent 429 with `requestId`.

## Phase 5 — Job lifecycle, credit integrity, RLS review

- Audit `generator_start_job` / `complete_job` / `fail_job` for idempotency (refund-once via unique index on `(job_id, type='refund')`). Add missing constraint if absent.
- Add atomic guard so concurrent polls can't double-complete (status transition guarded by `WHERE status IN (...)`).
- Provider polling: separate transient vs terminal errors in `external-api-adapter/service.ts`.
- Indexes: `(user_id, status, deleted_at)` on jobs; `(job_id, user_id, deleted_at)` on assets; `(user_id, deleted_at)` on user_images; rate-limit key.
- RLS review pass over the 6 tables + storage policies. Fix only gaps found.

## Phase 6 — Frontend reliability (no UI redesign)

- Extract focused hooks from `DashboardPage.tsx` without changing UI: `usePollJobs`, `useUpload`, `useWorkspacePersistence`, `useGenerationSubmit`. One module per turn, behavior-preserving.
- Replace `window.alert` with existing toast pattern.
- Centralized error mapper (401/402/403/409/413/429/timeout) → user message + action.
- Audit `URL.createObjectURL` sites for `revokeObjectURL` in cleanup.
- localStorage: zod schema validation + reconciliation with server state (already partially done for drafts).

---

## Recommended order

`1 → 2 → 3 → 4 → 5 → 6`. Phases 1–3 are highest security ROI and lowest UI risk. Phase 6 is the largest refactor and should land last, in small slices.

## Technical notes

- All schema changes via `supabase--migration`, additive only (no drops, no data loss).
- New edge secrets needed: `ALLOWED_APP_ORIGINS` (Phase 1), `VIDEO_PROXY_HMAC_SECRET` (Phase 2 if HMAC path chosen).
- `src/integrations/supabase/client.ts` and `types.ts` will not be edited; env-driven values flow through a new wrapper.
- Acceptance tests from your spec will be run at the end of each phase.

## Question

Which phase should I start with? Reply with a number (or numbers), or "1" to begin with secrets + CORS + log hygiene.
