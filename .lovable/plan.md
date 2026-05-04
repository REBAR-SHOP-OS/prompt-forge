## Problem

Clicking the merge icon shows: **"Merge failed: Failed to load video: https://dashscope-463f.oss-accelerate.aliyuncs.com/..."**

Root cause: the provider (Wan / Aliyun OSS) returns video URLs that do **not** include CORS headers. The merge code (`mergeVideoUrls`) and the continuation-seed code (`captureLastFrameAsBlob`) both load these URLs into a `<video crossOrigin="anonymous">` element so the canvas can read pixels. Without CORS headers from the origin, the load is rejected — the same reason the "Continuation seed failed" red message also appears in the screenshot.

This cannot be fixed purely on the frontend. We need a same-origin proxy that re-serves the bytes with proper CORS headers.

## Solution

Add a small streaming proxy edge function and route every external video URL through it before feeding it to the `<video>` element used for canvas capture.

### 1. New edge function: `video-proxy`

`supabase/functions/video-proxy/index.ts`

- `GET /video-proxy?url=<encoded provider URL>`
- Auth-required (uses `authenticate` from `_shared/core/auth.ts`) so it can't be abused as an open relay.
- Allow-list of host suffixes: `dashscope-*.aliyuncs.com`, `*.aliyuncs.com`, plus the project's own Supabase storage host. Reject anything else with 400.
- Forwards `Range` request header to upstream and mirrors `Content-Type`, `Content-Length`, `Content-Range`, `Accept-Ranges`, `ETag` on the response (range support is required for `<video>` seeking, which `captureLastFrameAsBlob` uses).
- Adds CORS headers: `Access-Control-Allow-Origin: *`, `Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges`.
- Streams the upstream body straight through (`return new Response(upstream.body, ...)`) — no buffering.
- Add `[functions.video-proxy] verify_jwt = false` is **not** needed; we keep JWT on, and the frontend passes the token via a query param (`&token=...`) because `<video>` can't set Authorization headers. The function accepts the token from either the `Authorization` header or a `token` query string.

### 2. Frontend helper: `proxiedVideoUrl(url)`

New file `src/modules/generator-ui/lib/proxiedVideoUrl.ts`:

- If the URL already points at our own Supabase storage / same origin → return as-is.
- Otherwise return `${FUNCTIONS_BASE}/video-proxy?url=<encoded>&token=<access_token>`.
- Reads the current session from `supabase.auth.getSession()` to attach the token.

### 3. Wire the helper into the two callers

`src/modules/generator-ui/pages/DashboardPage.tsx`
- In `handleMergeAllVideos`, map each `storage_path` through `proxiedVideoUrl(...)` before passing to `mergeVideoUrls`.
- In `handleAddVideoCard` (continuation seeding), pass the proxied URL into `captureLastFrameAsBlob`.

No change to `mergeVideos.ts` itself — it keeps `crossOrigin = 'anonymous'`, which now works because the proxy responds with `Access-Control-Allow-Origin: *`.

### 4. Minor UX

- Update the inline error to be friendlier: `"Could not load source video for merge — please try again in a moment."` while still logging the underlying message to the console for debugging.

## Files Touched

- **New**: `supabase/functions/video-proxy/index.ts`
- **New**: `src/modules/generator-ui/lib/proxiedVideoUrl.ts`
- **Edit**: `src/modules/generator-ui/pages/DashboardPage.tsx` (use proxied URLs in merge + continuation seed; clearer error copy)

## Result

- Clicking the merge icon will load every clip through the same-origin proxy, concatenate them into one `.webm`, upload to the `merged-videos` bucket, **auto-add it to "Saved videos / Your library"**, set it as the active preview, and trigger a browser download — exactly the existing flow, just no longer broken by CORS.
- Continuation seeding (the `+` icon that grabs the last frame of the previous clip) will also start working again.