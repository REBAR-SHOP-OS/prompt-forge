## Problem

In **Library → Final Videos**, clicking the download icon → **Download as MP4** appears to do nothing.

Root cause (in `src/modules/generator-ui/pages/DashboardPage.tsx`, `downloadAsMp4`, lines ~709–774):

1. Final films are **WebM** (produced by MediaRecorder). To make a real `.mp4`, the code runs the blob through `ensureMp4` → **ffmpeg.wasm**, which must download/boot a ~30 MB WASM core and then transcode.
2. During this entire process there is **no visual feedback** — only the small spinner on the icon. Booting ffmpeg + transcoding can take 20–90s, so to the user it looks frozen / like nothing happened.
3. On any ffmpeg failure (core blocked, OOM, timeout) `ensureMp4` **silently degrades** and returns the original WebM, or `downloadAsMp4`'s `catch` does `window.open(url)`. Either way the user never gets an MP4 and gets no explanation.

So the feature is "working as coded" but is effectively broken UX: slow, silent, and silently falling back to non-MP4.

## Fix (frontend only, safe & non-destructive)

All changes confined to `downloadAsMp4` in `DashboardPage.tsx`. No backend, no ffmpeg-engine logic changes.

1. **Immediate feedback** — on click, show a toast ("Preparing MP4…") so the user knows work started.
2. **Live progress** — pass an `onProgress` callback into `ensureMp4` and update the toast text with the stage (loading engine / encoding %). This makes the long transcode visibly active instead of frozen.
3. **Honest result reporting**:
   - On real MP4 success → success toast ("MP4 downloaded").
   - When ffmpeg is unavailable / transcode fails and we fall back to the original WebM → show a clear warning toast explaining the MP4 conversion failed and the original (WebM) was downloaded instead, rather than silently handing over a different format.
   - On total failure (fetch error) → error toast instead of a silent `window.open`.
4. **Keep the existing mobile / already-MP4 fast paths** unchanged (those already download correctly and instantly).

## Verification

After the change I will:
1. Run the build/typecheck.
2. Open the live preview, go to Library → Final Videos, click the download icon → Download as MP4, and confirm: the toast appears, progress updates, and a `.mp4` file actually downloads (or a clear message if the source is too large to transcode in-browser).
3. Confirm "Download as WEBM" still works (unchanged path).

## Notes / risk

- In-browser ffmpeg.wasm transcoding is inherently heavy; very large/long final films may still be too big to convert in the browser (`MAX_TRANSCODE_BLOB_BYTES` = 800 MB, plus practical RAM limits). For those cases the user will now get a clear message instead of silence. A fully reliable server-side transcode would be a larger, separate change — out of scope unless you want it.
- No changes to business logic, storage, or the ffmpeg engine itself — purely UX/feedback hardening around the existing call.