# Make the cover a real cover (with duration)

## Problem
Today the cover is only a UI element stored in `localStorage` (`coverImages`). It is **deliberately excluded** from the Final Film: `handleMergeAllVideos` builds `mergeClips` only from timeline clips and the cover is filtered out via `allCoverImageIds`. So it never appears in the exported video and is not used as a thumbnail by social platforms.

The fix: give the cover a **duration** and prepend it as the opening image segment of the Final Film, so it is truly rendered into the output file (and becomes the first frame that platforms pick up as a thumbnail).

## What will change (frontend only)

### 1. Cover duration value
- Add a persisted per-project cover duration (e.g. `coverDurations` keyed by `coverScopeKey`, stored in `localStorage` next to `coverImages`), defaulting to **3 seconds**.
- Range allowed: 1–10 seconds (consistent with existing image still clamps).

### 2. UI control on the cover card
In the cover card (around the "Film cover" header in `DashboardPage.tsx`), add a small duration control (compact number input or stepper labeled `Duration (s)`) next to the Replace/Remove buttons. Editing it updates and persists the cover duration. All labels in English.

### 3. Bake the cover into the Final Film
In `handleMergeAllVideos`, after `mergeClips` is built and before the merge runs, **prepend** the current cover (if one exists for the active scope) as an image clip:
```text
mergeClips = [ { kind: 'image', url: <proxied cover url>, durationSec: coverDuration }, ...existingClips ]
```
- Resolve the cover URL with `proxiedVideoUrl(currentCover.storage_path)` (same as other image clips).
- The cover is the **first** segment, so it becomes the opening frames and the natural thumbnail.
- Transitions array (`transitionsForMerge`) is rebuilt to account for the extra leading segment (add a leading `cut`/no transition so gap count stays `clips - 1`).
- Target-size detection still uses the first **video** clip; cover image does not change target dimensions.
- Audio offsets are unaffected (music/voiceover keep their own timeline offsets); the cover simply adds lead time at the start.

### 4. Keep existing behavior intact
- Cover still does not appear as an orphan draft/timeline card (the `allCoverImageIds` filtering stays).
- If no cover is set, the merge behaves exactly as today.

## Out of scope
No backend, auth, storage policy, or generation-logic changes. No change to how covers are generated in `AiImageDialog`.

## Verification
- Set a cover, set duration (e.g. 4s), run Final Film → exported file begins with the cover held for ~4s, then the clips play.
- Remove cover → Final Film starts directly with clips (unchanged).
- Typecheck clean.
