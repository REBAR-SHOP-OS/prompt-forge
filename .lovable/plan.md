## Root cause

The Final Film progress bar caps at 95% during the entire post-record pipeline:

```text
record clips ─► recorder.stop ─► ensureMp4 (ffmpeg.wasm) ─► storage upload ─► 100%
                                ▲
                                └─ this stage has NO timeout, NO progress, can hang forever
```

Concretely:

- `src/modules/generator-ui/pages/DashboardPage.tsx` line 3580 caps merge progress at `min(95, …)`. After `mergeVideoUrls()` returns, the UI jumps to 96 → 99 → 100. So **anything that stalls between `recorder.stop()` and the upload completing leaves the user stuck on 95%**.
- `src/modules/generator-ui/lib/mergeVideos.ts` line 776 explicitly emits `ratio: 0.95, stage: 'finalizing'`, then calls `ensureMp4()` (line 831) with no timeout. If ffmpeg.wasm hangs on encode (large WebM, OOM, hardware decoder stall), the merge promise never resolves → UI frozen at 95%.
- `src/modules/generator-ui/lib/transcodeToMp4.ts` wraps only `ff.load()` in `withTimeout`. The `ff.exec(remuxArgs)` and `ff.exec(buildEncodeArgs(...))` calls have no timeout and no progress reporting. ffmpeg.wasm's `progress` event is never wired up, so the UI has nothing to show during encoding either.
- The upload (line 3591) already has a 120s timeout, but its failure is invisible until it throws, and meanwhile the UI is still at 95%.

## What we're fixing

1. **Never hang silently in `ensureMp4`**
   - Wrap each `ff.exec(...)` call in a hard timeout (5 min default, configurable).
   - Wire ffmpeg.wasm's `ffmpeg.on('progress', …)` event and forward it as an `onProgress` callback (0..1 within the encode stage).
   - On timeout: `ffmpegSingleton.terminate()`, reset, throw a clear `ffmpeg encode timed out` error.

2. **Visible progress past 95% during finalize/encode/upload**
   - Extend `MergeProgress.stage` to include `'encoding'` and `'uploading'`. Emit progress in those stages from `mergeVideoUrls`/`ensureMp4`.
   - In `DashboardPage.tsx`, raise the cap during merge to 95, then map:
     - `finalizing` → 95
     - `encoding` 0..1 → 95..97
     - `uploading` 0..1 → 97..99
     - completed → 100
   - Surface the current stage as a small status string next to the percentage so the user sees `Encoding final video…` / `Uploading…` instead of a frozen number.

3. **Defensive watchdog around the whole pipeline**
   - In `DashboardPage.tsx`, wrap the merge + transcode + upload sequence in an overall timeout (e.g. 10 min). On timeout, surface a clear, recoverable error (toast + reset merge progress) instead of leaving the UI stuck.
   - Already-existing recorder.stop 8s watchdog stays.

4. **Reduce the chance of hitting ffmpeg.wasm encoder limits**
   - Add a brief preflight: if the recorded blob is over a configurable size (e.g. 800 MB), skip remux/encode and surface a precise error: `Final film is too large to transcode in-browser. Please shorten the project or use fewer 1080p clips.` This converts a silent hang into a clear actionable message.

## Files to change

- `src/modules/generator-ui/lib/transcodeToMp4.ts` — add per-exec timeout, ffmpeg.on('progress') hookup, optional `onProgress` parameter, oversized-blob preflight.
- `src/modules/generator-ui/lib/mergeVideos.ts` — extend `MergeProgress.stage` union, emit `'encoding'` + `'uploading'` stages, forward ffmpeg progress, propagate finer ratios past 0.95.
- `src/modules/generator-ui/pages/DashboardPage.tsx` — change `setMergeProgress` cap logic to map per-stage ratios into 95..99, add pipeline-level timeout, show stage label in the rendering UI.

## Safety

- No DB / migration / auth changes.
- No deletion or destructive behavior. Existing successful Final Film flows are unchanged — only the hung-at-95% path now either finishes with visible progress or fails with a clear error and reset UI state.
- Backwards compatible with existing saved clips and library entries.

## Validation

- Re-run a Final Film export end-to-end; confirm progress visibly advances past 95% with stage labels (`Encoding…`, `Uploading…`) and reaches 100%.
- Simulate a hung encode (force a very large blob) and confirm the watchdog surfaces a clear toast and resets `mergeProgress` to 0 instead of leaving 95% frozen.
- Build check via project harness.
