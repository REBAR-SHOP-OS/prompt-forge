## Goal

Let users place, drag, and trim a music/voiceover track along the video timeline so it starts at an exact point. Preview playback and the Final Film export must use the same timing.

## Current behavior (what exists today)

- Music: a selection window (`musicRange`) that loops across the whole film, always starting at film time 0.
- Voiceover: plays once, always from film time 0.
- Preview sync lives in `PreviewSoundtrackWaveforms.tsx` (driven by `SequentialClipPlayer.tsx` and `VideoWithSoundtrack.tsx`).
- Export mixing lives in `lib/mergeVideos.ts` (`music.startSec/endSec`, voiceover from 0).

There is currently **no concept of "where on the video the audio begins."** That is the core gap this feature fills.

## New placement metadata

Introduce a per-track placement object (kept in component state + persisted to `localStorage`, same pattern as `projectAudio`):

```text
audioPlacement = {
  startTimeInVideo   // seconds into the film where the track begins
  trimStart          // seconds trimmed from the head of the source
  trimEnd            // seconds trimmed from the tail of the source
  duration           // source duration (read from waveform)
}
```

Stored separately for music and voiceover. Clamped so the placed region never exceeds the film duration.

## UI — draggable placement bar (under the preview timeline)

New component `AudioPlacementTrack.tsx`:

- Renders the existing waveform inside a region whose **left edge = `startTimeInVideo`** and **width = trimmed duration**, both mapped to the full film width.
- Drag the whole region horizontally → updates `startTimeInVideo` (pointer events, works for mouse + touch). Clamped to `[0, filmDuration - regionLength]`.
- Drag left/right edge handles → updates `trimStart` / `trimEnd`.
- While dragging, show a small floating label with start time + duration (e.g. `0:05 · 0:12`).
- Visual style matches the current emerald music / indigo voiceover waveform look.
- Used in the preview area in `DashboardPage.tsx` below the scrub bar.

## Preview sync changes

Update `PreviewSoundtrackWaveforms.tsx` so playback honors the offset:

- Add props `musicStartInVideo`, `voiceoverStartInVideo`, plus trim values.
- In `handleSeek` / `syncTime`, given the film time `t`:
  - if `t < startTimeInVideo` → keep the track paused/silent.
  - else → audio position = `trimStart + (t - startTimeInVideo)`, stop at `trimEnd` (or loop within window for music if a loop window is set).
- `play()` only starts a track once the playhead has passed its start; otherwise it waits.

`SequentialClipPlayer.tsx` and `VideoWithSoundtrack.tsx` pass the new props through (they already forward the film time).

## Export changes (`lib/mergeVideos.ts`)

- Extend `MergeMusicTrack` / `MergeVoiceoverTrack` with `startInVideo`, `trimStart`, `trimEnd` (all optional, default 0 → fully backward compatible).
- In the recording loop, start each audio element only when the recorded timeline reaches `startInVideo`, seek it to `trimStart`, and stop at `trimEnd`. This mirrors the preview math exactly so exported timing matches.
- `DashboardPage.tsx` passes the placement metadata into `audioOpt`.

## Persistence

- Save `audioPlacement` per project in `localStorage` (extend the existing `project-audio:*` storage), so it survives refresh / reopening.

## Backward compatibility / safety

- All new fields are optional and default to `0` (= today's behavior). Existing projects, previews, and exports keep working unchanged when no placement is set.
- No backend, schema, or generation-flow changes.

## Verification

- Build passes.
- Manual preview check: add a track, drag it to start at ~5s, confirm silence before 5s and correct start after; refresh and confirm placement persists; run a Final Film and confirm audio starts at the same point as preview.

## Technical notes (files touched)

- `src/modules/generator-ui/components/AudioPlacementTrack.tsx` (new)
- `src/modules/generator-ui/components/PreviewSoundtrackWaveforms.tsx`
- `src/modules/generator-ui/components/SequentialClipPlayer.tsx`
- `src/modules/generator-ui/components/VideoWithSoundtrack.tsx`
- `src/modules/generator-ui/pages/DashboardPage.tsx`
- `src/modules/generator-ui/lib/mergeVideos.ts`