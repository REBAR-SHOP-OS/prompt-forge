## Goal

Upgrade the "Soundtrack for Final Film" modal so the audio is presented as an interactive **Waveform** with a proper **Seek Bar** and **Scrubbing**, replacing the current basic `<audio controls>` element + plain range slider.

## Current State

In `src/modules/generator-ui/pages/DashboardPage.tsx` (lines ~1460–1533), the modal shows:
- A native `<audio controls>` player
- A two-thumb `Slider` for selecting the start/end of the soundtrack region
- Preview / Done / Remove buttons

There is no visual waveform, no playhead indicator on the slider, and no click-to-seek/drag scrubbing on a timeline.

## Plan

### 1. Add a waveform library
Use **`wavesurfer.js`** (lightweight, no React wrapper required, works with any audio URL/blob). Install via `bun add wavesurfer.js`.

### 2. New component `SoundtrackWaveform.tsx`
Location: `src/modules/generator-ui/components/SoundtrackWaveform.tsx`

Responsibilities:
- Render a canvas-based waveform of `musicUrl` using WaveSurfer
- Show a moving **playhead** (seek bar) synced with playback
- Support **scrubbing**: click anywhere on the waveform to seek; drag the playhead to scrub
- Render the **selection region** (start/end) as a translucent overlay using WaveSurfer's `regions` plugin, with two draggable handles
- Emit callbacks: `onReady(duration)`, `onRangeChange([start, end])`, `onTimeUpdate(currentTime)`
- Expose imperative methods via `ref`: `play()`, `pause()`, `seekTo(seconds)`, `playRange(start, end)`

Visual style: matches existing dark theme (waveform in `zinc-400`, progress in white, region overlay in `emerald-400/20`).

### 3. Replace modal internals
In `DashboardPage.tsx` modal body (lines 1478–1511):
- Remove the native `<audio>` element and the standalone `Slider`
- Insert `<SoundtrackWaveform>` taking the full width, ~96px tall
- Below it keep the time readout: `currentTime / duration` on the left, `selection start – end` on the right
- Add a small Play/Pause button beside the time readout (since native controls are gone)

### 4. Wire up state
- Replace `musicPreviewAudioRef` usage with a ref to the new waveform component
- `handlePreviewMusicRange` calls `waveformRef.current?.playRange(musicRange[0], musicRange[1])`
- `handleMusicLoadedMetadata` is replaced by the component's `onReady` callback
- `musicRange` is updated via `onRangeChange` from region drag

### 5. Cleanup
Destroy the WaveSurfer instance on unmount / when `musicUrl` changes to avoid memory leaks.

## Technical Notes

- WaveSurfer v7 (ESM) is the version to install; uses Web Audio API + Canvas.
- Regions plugin: `import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'`.
- For long tracks, enable `normalize: true` and a reasonable `barWidth: 2, barGap: 1` for a clean look.
- No backend / DB changes required — purely a UI enhancement of the existing soundtrack picker. The selected `musicRange` continues to flow into `mergeVideos` as before.

## Out of Scope
- No changes to merge logic or audio processing pipeline.
- No changes to the prompt bar Music button or upload flow.
