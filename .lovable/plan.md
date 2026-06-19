# Enable Simultaneous Downloads

Right now only **one** download can run at a time. The state uses a single `downloadingId` (and a single `downloadProgress`), and every download function starts with `if (downloadingId) return`, which silently blocks a second click while any download is busy. We'll switch to per-item tracking so the user can download several films/images/audio at the same time.

## Core state change (`DashboardPage.tsx`)

Replace the two single-value states with per-id collections:

```text
downloadingId: string | null      ->  downloadingIds: Set<string>
downloadProgress: number | null   ->  downloadProgressMap: Record<string, number>
```

Add small helpers to mark an id as started/finished and to set/clear its progress, so each download manages only its own id.

## Update the four download functions

`downloadAsMp4`, `downloadDirect`, `downloadImageFile`, `downloadAudioFile` each:

- Change the guard `if (downloadingId) return` → `if (downloadingIds.has(id)) return` (block only a duplicate click on the **same** item, not all downloads).
- On start: add the id to `downloadingIds`.
- In `finally`: remove only that id from `downloadingIds` (and clear its progress entry for the MP4 path).
- In `downloadAsMp4`, the progress callbacks write to `downloadProgressMap[cardId]` instead of the global progress.

## Update every UI usage

All the call sites that read the single state get rewritten to the per-id form:

- `busy={downloadingId === X}` → `busy={downloadingIds.has(X)}`
- `progress={downloadingId === X ? downloadProgress : null}` → `progress={downloadProgressMap[X] ?? null}`
- `disabled={downloadingId === X}` and the spinner checks → `downloadingIds.has(X)`

This covers the film cards (`DownloadFormatMenu`), final-film cards, archive images, archive audio, and per-video music/voiceover buttons.

## Serialize only the heavy MP4 transcode

The MP4 conversion uses a single shared ffmpeg.wasm engine (`ensureMp4`), so two transcodes at once would corrupt each other and risk the OOM/page-jump issue we already fixed. To keep things safe while still feeling "simultaneous":

- Direct downloads, image downloads, and audio downloads (lightweight, native browser streaming / simple fetch) run fully in parallel — no limit.
- **MP4 conversions** are queued through a single in-flight promise chain: if one MP4 transcode is running, a second "Download as MP4" waits its turn (its button still shows as busy with a pending state) instead of running concurrently. Other download types are unaffected and still start immediately.

## Technical notes

- `Set`/object state must be updated immutably (`new Set(prev)`, `{ ...prev }`) so React re-renders.
- No backend, props, or styling changes — the emerald progress ring added earlier keeps working per-item.
- No new dependencies.
