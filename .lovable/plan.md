# Fix "ffmpeg core load timed out" on Apply changes (Trim clip)

## What's happening

When you click **Apply changes** in the Trim dialog, the app records the trimmed clip in the browser and then runs it through the in-browser video engine (ffmpeg.wasm) to produce a standard MP4. In the published app, the video engine's background worker never starts, so the loader waits the full 45 seconds and then reports:

```text
ffmpeg load failed: Video engine (ffmpeg) failed to start —
local: FFmpeg core load (local) timed out after 45000ms |
remote: FFmpeg core load (remote) timed out after 45000ms
```

Root cause: the engine spawns its worker via an implicit `new URL('./worker.js', import.meta.url)`. Because the engine package is intentionally excluded from Vite's dependency optimizer, that worker file is not reliably emitted/served in the production build, so the worker never replies to the "load" message. Both local and remote attempts fail for the same reason (the worker, not the core source, is the problem) — which is exactly why both time out at the identical 45 s.

## The fix (principled, minimal)

All changes are in `src/modules/generator-ui/lib/transcodeToMp4.ts`.

### 1. Bundle the engine worker explicitly so production serves it

Import the engine worker through Vite so it (and its internal imports) is compiled into our build with a stable, served URL, then hand that URL to the loader as `classWorkerURL`. This removes the dependency on Vite implicitly discovering the worker.

```ts
// Bundled by Vite as part of OUR build -> always emitted/served in production.
import ffmpegWorkerURL from '@ffmpeg/ffmpeg/worker?worker&url'
```

Then pass it in both load paths:

```ts
await ff.load({ coreURL: core, wasmURL: wasm, classWorkerURL: ffmpegWorkerURL })
```

(The exact import specifier will be resolved against the installed package's worker entry; if `@ffmpeg/ffmpeg/worker` is not exposed, the concrete dist path `@ffmpeg/ffmpeg/dist/esm/worker.js?worker&url` is used instead.)

### 2. Skip the engine entirely when the recording is already a valid MP4

The trimmer records with `MediaRecorder`, which on current Chrome/Edge already produces `video/mp4` (H.264/AAC). In that common case the engine is only doing a cosmetic faststart remux. `ensureMp4()` will short-circuit: if the input blob is already an MP4, return it as-is and never load the engine. This makes trimming succeed instantly for most users and sidesteps the engine path completely.

### 3. Degrade gracefully instead of hard-failing

If the engine still cannot load (older browser, blocked worker) AND the recording is not MP4 (WebM), `ensureMp4()` will return the original recorded blob with its real mime/extension and a console warning, rather than throwing. The trim result is still saved and playable; the only loss is the faststart optimization. "Apply changes" will no longer dead-end on an error toast.

The call site in `trimVideo.ts` (`ensureMp4(finalBlob, mimeType)`) already threads the returned `extension`/`mimeType` back through `onApply`, so a WebM fallback flows through correctly with no further changes.

## Verification

1. Open a clip, mark a cut, click **Apply changes** in the published preview.
2. Confirm the trimmed clip saves with no ffmpeg timeout error.
3. Confirm Final Film / merge (which also uses the engine) still works.
4. Check the console: when the recording is MP4 it should report the transcode was skipped; if the engine is used, it should load well under the timeout.

## Technical notes

- Files touched: `src/modules/generator-ui/lib/transcodeToMp4.ts` only (loader + `ensureMp4` early-return + graceful fallback). No backend, schema, or UI changes.
- `vite.config.ts` keeps `optimizeDeps.exclude` for the engine packages; the `?worker&url` import is compatible with that and is the supported way to ship the worker in production.
- No change to bitrate, scaling, or encode args — output quality for genuine transcodes is unchanged.
