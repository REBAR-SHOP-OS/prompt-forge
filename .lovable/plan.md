## Goal

1. Fix the actual cause of the "saved as WebM" fallback so Final Film really produces a standard `.mp4`.
2. Remove the Persian notice; all merge/finalize messages must be English.

## Root cause

The merge pipeline records WebM in the browser, then `ensureMp4()` transcodes it to MP4 with `ffmpeg.wasm`. Today that transcode runs the ffmpeg WebAssembly core fetched from `unpkg.com` / `jsdelivr` and uses `libx264 -preset veryfast -crf 23`. Two real failure modes cause the WebM fallback to fire:

- The CDN-hosted `ffmpeg-core.js` / `ffmpeg-core.wasm` (~31 MB) fails or stalls (network, ISP, ad-blockers, CORS hiccups). The 30s load timeout then trips.
- Long Final Films exceed the single-threaded ffmpeg.wasm memory ceiling during full re-encode and the `exec()` call aborts.

Both manifest as "MP4 transcode failed" → user sees a WebM file plus a Persian explanation.

## Fix

### 1. Self-host ffmpeg core (kills CDN failure mode)

- Import `ffmpeg-core.js` and `ffmpeg-core.wasm` from the `@ffmpeg/core` npm package as Vite asset URLs (`?url`) so they ship from our own origin (`/assets/ffmpeg-core.[hash].js|wasm`).
- Replace the `CDN_BASES` array with a single local pair. Keep one CDN as a last-ditch fallback only.
- Add `@ffmpeg/core` to `package.json`.
- Result: no third-party network dependency for the transcoder.

### 2. Memory-friendly encode (kills OOM on long videos)

In `ensureMp4()`:

- Detect input duration via a quick `ffprobe`-equivalent (`ff.exec(['-i', input])` parse) or by passing the known total duration from `mergeVideoUrls`.
- For non-MP4 inputs (the normal WebM case), use:
  - `-preset ultrafast` (was `veryfast`) — ~3× less RAM, slightly larger file.
  - `-tune zerolatency`, `-g 60`, `-threads 1`.
  - `-vf scale='min(1920,iw)':-2` cap to ≤1080p height equivalent so 4K WebMs don't blow memory.
  - Audio `-c:a aac -b:a 96k`.
- Wrap `ff.exec` in a single retry: if the first encode throws, terminate the core (`ff.terminate()` then reload) and retry with `-crf 28` + scale cap. Releases leaked WASM heap.

### 3. Remove the silent WebM fallback

- `mergeVideoUrls` no longer returns `{ degraded: true, extension: 'webm' }`. If MP4 conversion fails after the retry, it throws a plain English `Error` so the catch block in `DashboardPage` surfaces a real, actionable message instead of saving a half-working file.
- Drop the `degraded` field from `MergeResult` and from any caller.

### 4. English-only copy

- Delete the Persian `setVideoColumnMessage(...)` notice in `DashboardPage.tsx` (lines 3778-3784). Nothing replaces it — Final Film either succeeds (MP4) or fails with the existing English error.
- Also rewrite the in-code Persian comment in `SoundtrackWaveform.tsx` (line 112) to English.

### 5. Out of scope (ask before touching)

`CalendarInfoDialog.tsx` and `AuthForm.tsx` contain Persian strings, but they are part of an intentional bilingual feature (explicit EN/FA toggle, bilingual auth confirmations). I will not remove those unless you confirm — let me know if you want them stripped too.

## Files to edit

- `src/modules/generator-ui/lib/transcodeToMp4.ts` — self-host core, ultrafast preset, scale cap, retry with terminate.
- `src/modules/generator-ui/lib/mergeVideos.ts` — remove WebM fallback, drop `degraded`, propagate ffmpeg error.
- `src/modules/generator-ui/pages/DashboardPage.tsx` — delete the Persian degraded notice block; existing English catch-block error remains.
- `src/modules/generator-ui/components/SoundtrackWaveform.tsx` — translate the Persian comment.
- `package.json` — add `@ffmpeg/core` dependency.

No schema, edge function, or RLS changes.

## Verification

- Open a Final Film with a long (>60s) WebM merge → file saves as `.mp4`, plays in QuickTime.
- Block `unpkg.com` in devtools → still succeeds (core served locally).
- Force a contrived ffmpeg failure → user sees an English error message, no WebM file is uploaded.
