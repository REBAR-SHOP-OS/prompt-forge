## Goal
Make the trim timeline in `ClipTrimmerDialog.tsx` more professional and add a seconds ruler with tick marks and time labels, so every part of the clip is precisely controllable.

## What will change (frontend only, `src/modules/generator-ui/components/ClipTrimmerDialog.tsx`)

1. **Seconds ruler above the track**
   - Add a thin tick row aligned to the track width.
   - Compute a smart tick interval based on duration (e.g. 0.5s for short clips, 1s/2s/5s/10s for longer clips) so labels never crowd.
   - Major ticks get a time label (`0:00`, `0:05`, …) using the existing `fmtTime`; minor ticks are short lines.

2. **More precise scrubbing**
   - Keep click-to-seek, and add drag (pointer down + move) on the track so the playhead can be dragged smoothly.
   - Show a live time tooltip/label at the playhead position while scrubbing.

3. **Cleaner, taller track styling**
   - Slightly refined track look (rounded, subtle grid lines at tick positions) so it reads like an editor timeline.
   - Keep existing colors: progress (emerald), cut ranges (rose), pending marker (amber), playhead (white).

4. **Frame-accurate readout**
   - Display current time with one decimal (e.g. `0:10.4`) near the playhead and in the existing top readout, since the underlying values are already fractional.

## Out of scope
- No backend, trim logic, or `trimVideoLocally` changes.
- No new dependencies; pure layout/markup/Tailwind within the existing component.

## Notes
All work stays inside the single component file using existing state (`duration`, `currentTime`, `cuts`, `pendingStart`) and the existing `fmtTime` helper.