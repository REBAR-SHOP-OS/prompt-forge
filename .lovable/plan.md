# Fix: Merge progress stuck at 0%

## Problem

When the user clicks the "merge all videos" icon, the circular progress indicator sits at **0%** for a very long time (often the entire merge), even though the merge is actually working in the background. The current `mergeVideoUrls` only emits a progress update **after** each full clip finishes transcoding. For a single 5–10s clip on `ffmpeg.wasm` (single-threaded UMD core), that first transcode can take 30–90+ seconds — during which the UI shows 0%, looking frozen.

On top of that:
- The first call also has to download the ~25 MB FFmpeg core from unpkg. No progress is shown for that phase either.
- If `ffmpeg.load()` hangs or throws, there is no console diagnostic — it just looks stuck.
- There is no internal hook into FFmpeg's native `progress` event, which reports real per-frame progress while a clip is being processed.

## Root cause

`src/modules/generator-ui/lib/mergeVideos.ts` only calls `onProgress` between clips:

```ts
onProgress?.({ ratio: ((i + 1) / urls.length) * 0.85, ... })
```

So during the longest part of the work — the actual transcode of clip 1 — the ratio stays at 0.

## Fix

Rewrite the progress reporting in `mergeVideos.ts` so the UI advances continuously from the moment the user clicks merge, until the final MP4 is ready.

### 1. Emit progress immediately + during FFmpeg load

- Emit `ratio: 0.01` right when `mergeVideoUrls` is called, so the ring leaves 0% instantly.
- Reserve a small budget (e.g. `0 → 0.05`) for the FFmpeg core download/load. Emit `0.03` when load starts and `0.05` when it finishes.

### 2. Use FFmpeg's native `progress` event for per-clip progress

`@ffmpeg/ffmpeg` v0.12 exposes `ff.on('progress', ({ progress }) => …)` where `progress` is `0..1` for the currently-running command. Hook into it and translate into the overall ratio:

```
overall = 0.05 + (clipIndex - 1 + clipProgress) / totalClips * 0.85
```

So while clip 1 is transcoding, the bar moves smoothly from 5% up to ~ 5% + 85% / N. Then clip 2 takes over, etc.

### 3. Reserve final 10% for concat + readFile

Concat with `-c copy` is fast but not instant. Bump the bar to `0.92` when concat starts and `1.0` when the blob is built.

### 4. Diagnostics

- Add `ff.on('log', …)` that forwards to `console.debug('[ffmpeg]', message)` so we can see what's happening in DevTools next time.
- Wrap `getFFmpeg()` so a load failure throws a clear `Error('FFmpeg core failed to load: …')` instead of hanging.
- Add `console.info` markers at each stage (`load`, `fetch clip i`, `transcode clip i`, `concat`, `done`) so any future "stuck" report can be diagnosed in seconds.

### 5. Caller doesn't change

`DashboardPage.tsx` already does:
```ts
const blob = await mergeVideoUrls(urls, (p) => setMergeProgress(Math.round(p.ratio * 100)))
```
That keeps working — it just now receives many more progress callbacks instead of N.

## Files touched

- `src/modules/generator-ui/lib/mergeVideos.ts` — only this file.

## Out of scope

- No UI changes. The circular ring already binds to `mergeProgress`; making that value move smoothly is enough.
- No change to MP4 output, audio handling, or the upload/download flow — those work correctly today.
- No COOP/COEP headers (we stay on the single-threaded UMD core which works without them; multi-threaded would be a bigger separate change).
