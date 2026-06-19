# MP4 download: live percentage + reliability fix

## Goal
When the user picks **MP4 (compatible)** from the download menu, show a live **percentage** while the file is being prepared, and fix the current problem where the MP4 download fails / never completes. Then verify it actually works in the preview, and iterate if it still fails.

## Background (what happens today)
`downloadAsMp4` (in `src/modules/generator-ui/pages/DashboardPage.tsx`) does:
1. resolve a signed URL via `proxiedVideoUrl(storage_path)`
2. `fetch` the file into a blob
3. on desktop, run it through `ensureMp4` (ffmpeg.wasm) to transcode WebM → standard MP4
4. trigger a blob download

Problems:
- Step 3 (ffmpeg.wasm) is heavy and can hang or fail to load the worker/core in the preview environment. While it runs, the UI shows only an indefinite spinner with **no percentage**, and on failure it silently falls back to a `.webm` file — so the "MP4" download appears broken.
- No progress is surfaced even though `ensureMp4` already accepts an `onProgress` callback (loading / encode / readout stages).

## Changes

### 1. Live percentage (UI + wiring)
- Add state `downloadProgress: number | null` (0–100) next to `downloadingId`.
- In `downloadAsMp4`, pass an `onProgress` callback to `ensureMp4` that maps its stages to a percentage:
  - `loading` → small fixed band (e.g. 1–10%)
  - `encode` → `10 + ratio * 85` (10–95%)
  - `readout` → 100%
- Reset `downloadProgress` to `null` in the `finally` block.
- In both download buttons (Library row ~line 9413 and workspace pending row ~line 7657), when `downloadingId` matches the card, render the **percentage text** (e.g. `42%`) instead of / beside the spinner. Fall back to the spinner when progress is still `null` (e.g. fetch/sign phase).

### 2. Fix MP4 download reliability
- Surface real failures instead of silently degrading: if `ensureMp4` returns a non-mp4 (`webm`) result, show a clear toast explaining the file was downloaded in original format because the in-browser converter was unavailable, rather than implying it is an MP4.
- Guard the fetch/sign step so a raw storage path (no scheme) is signed via the existing `signStorageUrl` helper before fetching, ensuring the blob is always obtained (covers the case where `proxiedVideoUrl` can't parse a non-URL path).
- Keep the existing robust blob-download mechanism (already correct per cross-origin best practice).
- Ensure the spinner/percentage state is always cleared on every exit path so the button can never get stuck.

### 3. Test and iterate
- Run the app, open the Library, open the download menu on a Final Film, click **MP4 (compatible)**.
- Watch console + network + the button: confirm the percentage advances and a real `.mp4` file downloads.
- If ffmpeg.wasm fails to load in the preview, diagnose from console logs (worker/core load errors) and fix the root cause (e.g. correct worker URL handling / fallback path) so MP4 conversion actually succeeds, then re-test until the MP4 downloads correctly.

## Files
- `src/modules/generator-ui/pages/DashboardPage.tsx` — progress state, `downloadAsMp4` wiring, both download-button renders.
- Possibly `src/modules/generator-ui/lib/transcodeToMp4.ts` — only if testing reveals a real ffmpeg load/encode bug to fix.

No backend, database, or storage changes.
