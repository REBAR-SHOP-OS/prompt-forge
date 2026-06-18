# Fix: MP4 download stuck at 0% and never finishing

## Problem
When you click **MP4** on a Final Film, the button sits at `0%` and often never downloads.

Root cause (verified in code):
1. Final Films are stored as **WebM** (MediaRecorder). Streamed WebM has **no duration in its header**.
2. The progress shown on the button comes only from ffmpeg.wasm's native `progress` event. Without a known duration, ffmpeg reports `progress = 0` for the whole encode → the button is frozen at `0%`.
3. The single-thread `ultrafast` encode of a 1080p film is slow and can hit the 5-minute timeout, so sometimes **no file is produced at all** and the conversion silently ends.

This is a frontend/presentation problem only — no backend or schema change is needed.

## Goal
- The percentage moves and reflects real progress (never stuck at 0).
- A real, playable `.mp4` is always produced for WebM films.
- If conversion genuinely can't finish, the user always still gets a valid file (with its true extension) plus a clear message — never a frozen button.

## Changes

### 1. `transcodeToMp4.ts` — reliable progress (the core fix)
- Before encoding, probe the **source duration** from the WebM blob using a hidden `<video>` element (`loadedmetadata`). This gives a known total time even though the container header lacks it.
- Subscribe to ffmpeg's **log stream** (`ff.on('log', ...)`) and parse `time=HH:MM:SS.xx` lines from the encoder. Compute `ratio = currentTime / duration`. This produces real progress even when the native `progress` event reports 0.
- Keep the existing native `progress` event as a secondary source; use whichever is higher so the bar only moves forward.
- Add a low-rate **heartbeat** (small monotonic nudge, capped at ~95%) so the UI is never visually frozen during long single steps.

### 2. `transcodeToMp4.ts` — guaranteed completion
- On encode timeout/failure, retry once at **720p** (`scale='min(1280,iw)':-2`) which is markedly faster/lighter and usually completes where 1080p stalls.
- Keep the existing graceful degrade: if the engine can't run at all, return the original WebM with its true extension (already implemented) — but now always surface a clear toast.

### 3. `DashboardPage.tsx` — honest UI state
- Initialize the button to a `…` / `0%` "preparing" state and update from the new real-ratio callback.
- Ensure `downloadProgress` is reset in `finally` (already done) and that a download is always triggered on every code path (success → mp4; degrade → original with correct extension).

## Out of scope (not changing now)
- No server-side conversion / new edge function (edge runtime has no ffmpeg binary and payload limits — would be a larger, riskier change). The in-browser path is fixed to be reliable instead.
- No change to how films are recorded/stored.

## Validation
- Open the preview, click **MP4** on a WebM Final Film, confirm the percentage climbs from 0 → 100 and a playable `.mp4` downloads.
- Confirm a film already stored as MP4 downloads instantly.
- Check console for ffmpeg log/progress and absence of timeouts.

## Technical notes
- Duration probe: `URL.createObjectURL(blob)` → `<video>.preload="metadata"` → read `video.duration`, then revoke. Guard `Infinity`/`NaN` (fallback to native-progress-only).
- ffmpeg log parsing regex: `/time=(\d+):(\d+):(\d+\.\d+)/`.
- All work stays in `src/modules/generator-ui/lib/transcodeToMp4.ts` and `src/modules/generator-ui/pages/DashboardPage.tsx`.
