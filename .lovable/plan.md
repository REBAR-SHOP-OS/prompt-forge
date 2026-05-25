## Problem

The Video-to-Video dialog stays at **"Preparing… 0%"** forever. That stage corresponds to `editVideoWithAi`'s `getFFmpeg()` call — i.e. ffmpeg.wasm core never finishes loading. The error swallowed by the dialog is empty, so nothing surfaces to the user.

`editVideoWithAi.ts` has its own naïve loader:

```ts
await ff.load({ coreURL: core, wasmURL: wasm })
```

with **no timeout, no remote fallback, no reset on retry**. Meanwhile `transcodeToMp4.ts` already ships a robust loader (`getFFmpeg`, `resetFFmpeg`, `stringifyAny`) with local → unpkg fallback + 60s timeouts, which is what the working Final Film pipeline uses. The fact that Final Film works but Video-to-Video doesn't strongly indicates the local `@ffmpeg/core` URL is failing in this preview and the editor needs the same fallback.

## Plan

Frontend-only changes. No DB, no edge function, no secret changes.

### 1. `src/modules/generator-ui/lib/transcodeToMp4.ts`
- Export `getFFmpeg`, `resetFFmpeg`, and `stringifyAny` so other modules can reuse the proven loader.

### 2. `src/modules/generator-ui/lib/editVideoWithAi.ts`
- Remove the local `ffmpegSingleton` + `getFFmpeg()` and the `@ffmpeg/core` / `wasm` imports.
- Import `{ getFFmpeg, resetFFmpeg, stringifyAny }` from `./transcodeToMp4`.
- Wrap every ffmpeg/network stage in a `runStage(label, fn)` helper so thrown errors become `Error("video-edit <stage> failed: <real reason>")` instead of empty strings.
- After `await getFFmpeg()`, immediately emit `onProgress({ stage: 'loading', ratio: 1 })` so the UI clearly moves off 0%.
- After `ff.exec(extract)` , verify `listDir` returned ≥1 frame; if 0, throw a clear "No frames could be extracted" error.
- Wrap each `supabase.functions.invoke('ai-image-edit', …)` in a 30s `AbortController` timeout so a hung gateway call surfaces instead of silently stalling.
- On any failure inside the encode step, call `resetFFmpeg()` once and retry, mirroring Final Film's recovery.
- Reduce defaults: `fps` 6 → **4**, `maxDurationSec` 8 → **6** (caps API calls at 24 — safer for rate limits).

### 3. `src/modules/generator-ui/components/VideoToVideoDialog.tsx`
- Replace `setError((e as Error).message ?? 'AI video edit failed')` with `setError(stringifyAny(e) || 'AI video edit failed')` so non-Error throws and empty messages still render a readable string.
- Update the dialog caption text to reflect new defaults (6s @ 4fps).

## Files touched

- `src/modules/generator-ui/lib/transcodeToMp4.ts` (export 3 helpers)
- `src/modules/generator-ui/lib/editVideoWithAi.ts` (rewrite loader + error handling)
- `src/modules/generator-ui/components/VideoToVideoDialog.tsx` (better error display)

## Validation

After build, open the dialog with the same clip, submit any prompt, and watch the stage label progress past "Preparing… 0%". If ffmpeg core still cannot load, the visible error will now be e.g. *"FFmpeg core could not be loaded — local: … | remote: …"* instead of nothing, which tells us exactly what to fix next.
