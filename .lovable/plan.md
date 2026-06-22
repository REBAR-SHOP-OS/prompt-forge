Rebuild the per-card **Narration** dialog so it shows the prompt narration, the actual narration spoken on the film, and a comparison/health check between them.

## Problem
- The Narration dialog only runs `extractNarration()`, which matches **quoted text only**. When the scenario writer emits the narration as a labeled line (`Narration: …` / the translated label) without quotes, or with non-standard quotes, it is missed → "No narration detected" even though the prompt contained narration.
- The dialog never shows what was actually spoken in the rendered video, and never flags mismatches (missing narration on film, wrong wording, mispronunciation).

## Goal
A single Narration dialog with three sections:
1. **Narration (from prompt)** — what the narration *should* be.
2. **Narration (on film)** — what was actually spoken, transcribed from the video audio.
3. **Check** — automatic comparison: presence/absence, wording mismatch, and pronunciation issues, with a clear notice to the user. The rule: the on-film narration must match the prompt narration.

## Changes

### 1. Fix prompt-narration extraction — `DashboardPage.tsx` `extractNarration()`
- Keep the existing quoted-text matching.
- Additionally capture **labeled narration lines**: any line starting with a narration label followed by `:` (the same labels the scenario writer uses — `Narration`, plus the localized labels for fa/ar/tr/es/fr), taking the remainder of the line (stripping surrounding quotes if present).
- De-duplicate as today. This makes narration detected whether or not the model wrapped it in quotes.

### 2. Turn the Narration dialog into a comparison panel
- Change `narrationViewer` state from `string[] | null` to the selected job object (so the dialog has access to `input_prompt` and `video.storage_path`). The trigger button passes the job instead of the pre-extracted array.
- Dialog content:
  - **From prompt**: render `extractNarration(job.input_prompt)`; if empty, show the existing empty hint.
  - **On film**: only when the card has a completed video. Resolve a fetchable URL via `proxiedVideoUrl(job.video.storage_path)` and call the existing `video-transcript` edge function (same contract as `TranscriptPanel`). Show a "Transcribe" action / loading state, then render the transcript with the existing low-confidence word highlighting + click-to-hear pronunciation (reuse the logic/markup from `TranscriptPanel`).
  - **Check**: after both are available, compute a normalized comparison client-side:
    - prompt has narration but film has none → "Narration is missing from the film".
    - film has speech but prompt has none → "Film contains narration that isn't in the prompt".
    - both present but normalized text differs beyond a small threshold → "On-film narration differs from the prompt" and show both for review.
    - any low-confidence (likely mispronounced) words present → "Possible pronunciation issues" with the highlighted words.
    - all good → green "Narration matches the prompt".

### 3. Reuse, don't duplicate
- Extract the transcript-rendering + pronunciation playback already in `TranscriptPanel` into a small shared piece (or import/reuse) so the Narration dialog and the Transcript page stay consistent. No new backend is added — it reuses `video-transcript` and `tts-generate`.

## Technical notes
- Comparison/normalization (lowercase, strip punctuation/diacritics, collapse whitespace) runs in the client — deterministic, no extra AI cost. Pronunciation flags come from the transcript's existing `words[].lowConfidence`.
- Only the Narration dialog and `extractNarration` change; the card list, generation flow, and edge functions are untouched.

No database or edge-function changes.