## Problem

For videos longer than 15 seconds, scenes are generated as a **chain**: each next card uses the *last frame* of the previous clip as its start frame (`submitScenesAsJobs` → `waitForLastFrameUrl` in `DashboardPage.tsx`). The captured last frame is uploaded to the **`wan-frames`** storage bucket, then handed to the backend as a URL via:

```
supabase.storage.from('wan-frames').getPublicUrl(storagePath)
// → /storage/v1/object/public/wan-frames/<userId>/scene-chain-...png
```

But `wan-frames` is a **private** bucket. The backend (`fetchAsInlineData` in `external-api-adapter/service.ts`) fetches that frame with a plain, unauthenticated `fetch(url)` to feed Veo's first/last-frame extension. A `public` URL on a private bucket returns an error, so the fetch fails and the card shows **"Failed to download …scene-chain-…png"** — exactly the error in the screenshot. The first card works because it uses a directly-supplied image; only the chained next cards (>15s) hit this path.

Every `wan-frames` staging site in the app uses the same broken `getPublicUrl` pattern, so the fix should be at the fetch layer to cover all of them robustly.

## Fix (root cause, single robust change)

Harden the backend frame fetcher so it downloads the project's **own** storage objects with the service-role client instead of an unauthenticated public fetch.

### `supabase/functions/_shared/modules/external-api-adapter/service.ts` — `fetchAsInlineData`
- Detect when the incoming URL points to this project's Supabase Storage (matches `SUPABASE_URL` + `/storage/v1/object/(public|sign)/<bucket>/<key>`).
- For those, use `getServiceClient().storage.from(bucket).download(key)` (service role bypasses the private-bucket restriction and RLS), then base64-encode the bytes as today.
- For any other (genuinely external) URL, keep the existing plain `fetch(url)` path unchanged.
- This makes both `public`- and `sign`-form URLs work, is immune to signed-URL expiry during long extension/queue waits, and fixes first-frame staging too — not just scene chaining.

Imports needed in that file: `getServiceClient` from `../../core/supabase.ts` and `getEnv` (already imported).

## Verification
- Re-deploy the edge function.
- Use the existing scenario flow (or a direct `curl`) to create a 30s/chained job whose `firstFrameUrl` is a `wan-frames` public-form URL, and confirm the job no longer fails at the download step (check `edge_function_logs`).
- Confirm a normal single 15s job (external/first image) still generates correctly — the external-URL branch is untouched.

## Notes
- Pure backend fix; no schema, bucket-visibility, or frontend changes required. `wan-frames` stays private (correct for user content).
- Minimal, non-destructive, and covers all current and future `wan-frames` frame-staging call sites at once.