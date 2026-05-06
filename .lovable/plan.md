## Goal

Currently both duration pickers are hard-locked to `5s / 10s / 15s`:

1. The bottom composer bar — sets the default duration for newly generated video clips.
2. Each uploaded image card — sets how long that still appears in Final Film.

The user wants to type any duration they want, not be limited to those three numbers.

## What changes

### A. Bottom composer "Clip duration" picker (DashboardPage.tsx ~line 3024)

Keep the three quick presets (5 / 10 / 15) and add:

- A small `Custom` chip next to them.
- Clicking it reveals an inline number input (`<input type="number">`) with a tiny "s" suffix.
- The user can type any integer between **1 and 10** seconds (Wan 2.7 model cap, see comment at line 223 of the file). Values outside the range get clamped on blur, with a small hint shown beneath the input on clamp.
- The active state correctly highlights either a preset chip or the Custom chip when its value is in use.

Type widening: change `useState<5 | 10 | 15>(5)` to `useState<number>(5)` so any integer in [1,10] is accepted by the existing `createJob({ durationSeconds })` calls (lines 1292 / 1302 / 1313 / 1323) without any other changes.

### B. Per-image "Duration" picker on uploaded image cards (DashboardPage.tsx ~line 2536)

Same pattern:

- Keep 5 / 10 / 15 presets.
- Add a `Custom` chip → inline number input (1–60 seconds — stills are not constrained by the video model, only by the existing `updateImageDuration` clamp which we'll widen from 15 → 60).
- Update `updateImageDuration` (line 1000) clamp: `Math.max(1, Math.min(60, …))`.
- Persist as today via the existing Supabase update on `generator_user_images.still_duration_seconds`.

### C. UX details

- Number input is compact (~3ch wide), right-aligned, with the same pill styling as the preset chips so the row stays visually consistent.
- `Enter` / blur commits the value; `Esc` cancels and reverts.
- Empty input on blur falls back to the previous value (no NaN sent to DB or API).
- All RTL/Persian text and existing styling is preserved.

## Out of scope

- No DB schema change — column already accepts any integer.
- No edge-function or merge-pipeline change — `mergeVideos.ts` and `imageToClip.ts` already read `still_duration_seconds` as a number.
- Wan 2.7 hard-cap (10s) is preserved for generated video clips; only stills can go higher.

## Files touched

- `src/modules/generator-ui/pages/DashboardPage.tsx` — both pickers, `durationSeconds` state type, `updateImageDuration` clamp.

That's the entire change.