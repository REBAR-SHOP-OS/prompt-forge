# Fix: "Could not start video generation"

## What's actually wrong

The button is failing with **"Could not start video generation"** because the browser's `fetch()` to the `jobs-create` Edge Function fails at the network layer ("Failed to fetch" in the network log). This happens **before** the function executes — it's a CORS preflight rejection.

### Evidence
- **Browser network log** for `POST /functions/v1/jobs-create`: `Error: Failed to fetch` (no HTTP status returned).
- **Direct server-side test** of the same function (via `supabase--curl_edge_functions`): returns **HTTP 200** with a valid `jobId`. So the function logic, auth, credits, and provider routing all work.
- **Preflight test** (`OPTIONS` from `Origin: https://...lovableproject.com`) returns **200**, but the response is **missing the `Access-Control-Allow-Origin` header**. The browser therefore blocks the actual POST.
- The shared CORS helper (`supabase/functions/_shared/core/http.ts`) already contains a `LOVABLE_ORIGIN_PATTERNS` regex that allow-lists `*.lovableproject.com`, `*.lovable.app`, etc. — but the **currently deployed** `jobs-create` function is using an older bundle that doesn't echo the origin back. (Edge function logs show it last booted at 16:32:03 with no recent code update; recent shared-file edits to `http.ts` haven't been picked up because no edge function under `supabase/functions/` was re-saved.)

This also explains the earlier 401 reports on `jobs-delete` / `jobs-get`: same root cause — the browser can't complete the request, so the UI surfaces a generic failure.

## The fix

Force a redeploy of the affected edge functions so they bundle the **current** shared `http.ts` (with the Lovable-origin allow-list). Edge functions are auto-deployed when their `index.ts` is touched.

### Steps

1. **Touch each affected edge function `index.ts`** so the platform rebuilds them with the latest shared CORS code:
   - `supabase/functions/jobs-create/index.ts`
   - `supabase/functions/jobs-get/index.ts`
   - `supabase/functions/jobs-list/index.ts`
   - `supabase/functions/jobs-delete/index.ts`
   - `supabase/functions/me/index.ts`
   - `supabase/functions/usage-credits/index.ts`
   - `supabase/functions/videos-list/index.ts`
   - `supabase/functions/ai-gateway-route-preview/index.ts`
   - `supabase/functions/video-proxy/index.ts`
   
   No behavior change — just add a trivial comment line to trigger redeploy.

2. **Verify** the preflight after redeploy by calling `OPTIONS` with an `Origin: ...lovableproject.com` header and confirming the response includes `Access-Control-Allow-Origin: https://...lovableproject.com`.

3. **Re-test** the user flow: enter a prompt (e.g., "یک خودرو در حال حرکت"), choose Text-to-Video / 5s, click submit. Expect a job card to appear in History with status "Rendering" instead of the red "Could not start video generation" toast.

### Why not change CORS env vars?
The shared code already handles Lovable origins automatically via regex; no env var (`CORS_ALLOW_ORIGINS`) needs to be set. The only missing piece is getting the new code onto the deployed functions, which a redeploy accomplishes.

### Files touched
- 9 edge function `index.ts` files (one-line no-op comment to trigger redeploy)

No frontend changes, no DB migrations, no secrets needed.
