## Goal

Under the video preview (both the single-clip preview and the multi-clip "Live preview" sequence), show the **music** and **voiceover** tracks as audio **waveforms** whenever they exist — and make those tracks **always locked to the video's playback** (play / pause / seek / end), so audio can never drift or play independently of the picture.

## Current behavior

- The preview renders the video via `SequentialClipPlayer` (multi-clip) or `VideoWithSoundtrack` (single clip).
- Music and voiceover are attached as **hidden `<audio>` elements** synced to the video through event listeners. There is no waveform under the preview, and on edge cases (seek, src swap, autoplay block) the audio can desync from the picture.
- A `SoundtrackWaveform` component (built on `wavesurfer.js`, already a dependency) exists, but it is only used in the music-selection editor, not under the preview, and it is an interactive region editor — not a synced display.

## What will change

### 1. New presentational component: `PreviewSoundtrackWaveforms`
`src/modules/generator-ui/components/PreviewSoundtrackWaveforms.tsx`

- Renders one compact waveform row for **music** (only if `musicUrl`) and one for **voiceover** (only if `voiceoverUrl`), each with a small label and the wavesurfer waveform.
- Each waveform uses `wavesurfer.js` with `interact: false` (display-only; no separate transport controls) so the user can never start/scrub audio on its own — it strictly mirrors the video.
- Exposes an imperative handle (`play`, `pause`, `seek(seconds)`, `setProgress(fraction)`, `setVolume`) used by the parent to keep it attached to the video. WaveSurfer owns the actual audio playback (so there is a single audio source, removing the duplicate hidden `<audio>` and the drift it caused).
- Music respects the existing `musicRange` window (loops inside the green selection range, same as today).

### 2. Wire it into the sequence preview (`SequentialClipPlayer.tsx`)
- Remove the hidden `<audio>` overlays and instead render `PreviewSoundtrackWaveforms` directly **below the preview frame** (in the existing footer area under the clip label).
- Drive the waveforms from the same `isPlaying` state and the active `<video>`'s `play` / `pause` / `ended` / `timeupdate` events so music + voice start, stop, and resume exactly with the picture across clip transitions. On pause/seek/replay the audio follows the video, never the reverse.

### 3. Wire it into the single-clip preview (`DashboardPage.tsx` + `VideoWithSoundtrack.tsx`)
- In `VideoWithSoundtrack`, replace the hidden `<audio>` elements with the same `PreviewSoundtrackWaveforms` rendered under the video, driven by the `<video>` element's events (the sync logic already lives here — it will now control the waveform handle instead of bare `<audio>` refs).
- The waveforms appear under the single-clip preview footer just like in the sequence preview.

### 4. Keep existing volume / mix behavior
- `clipVolume`, `musicVolume`, `voiceoverVolume`, `soundtrackMode` (music-only) and `musicRange` continue to apply unchanged — they now flow into the waveform handle's volume/range instead of the `<audio>` elements.
- Final Film generation and snapshotting are untouched (this only affects the live preview UI).

## Technical notes

- `wavesurfer.js` + its regions plugin are already installed and used by `SoundtrackWaveform`, so no new dependency.
- Display-only waveforms set `interact:false` and have no play button, guaranteeing they cannot be played separately from the video.
- Sync direction is always **video → audio**: a single set of listeners on the video element drives `play/pause/seek`. This removes the current dual-source setup that allowed drift.
- Waveform height kept small (~40px) so the preview footer stays compact for both 9:16 and 16:9 frames.

## Verification

- Open a project with both music and a voiceover, hit Live preview: confirm two waveforms render under the video, playheads advance together with the video, and pausing/seeking/replaying the video keeps audio locked to the picture.
- Confirm a clip with only music (or only voiceover) shows just that one waveform, and a clip with neither shows none.
- Confirm music still loops within the selected green range and `music-only` mode still mutes the clip's own track.
