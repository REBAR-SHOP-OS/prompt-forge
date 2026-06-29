# Fix: Music & narration lost when reverting Final Film to Draft

## Problem
`reopenFinalAsDraft` (DashboardPage.tsx) restores the soundtrack only from `projectAudio[finalId]`. When that entry is missing or empty (best‑effort snapshot at finalize can fail, or the audio is still stored under the original draft key), the reopened draft loses its music and narration even though the audio files still exist in storage.

## Goal
When a Final Film is reverted to Draft, music and narration are always reattached if they exist anywhere for that project — safely, without touching unrelated behavior or other audio of other projects.

## Changes (single file: `src/modules/generator-ui/pages/DashboardPage.tsx`)

### 1. Resolve audio from a fallback chain in `reopenFinalAsDraft`
Replace the single lookup `const movedAudio = projectAudio[finalId]` with a resolved source that checks, in order:
1. `projectAudio[finalId]` — audio snapshotted onto the final film.
2. `projectAudio[draftId]` — the recovered original draft's soundtrack (the `draftId` is already computed from `draft_group_id` earlier in the function).

Pick the first entry that actually has `music` or `voiceover`. This recovers the soundtrack for older/failed finalizations where only the draft-scoped copy survives.

### 2. Make the atomic move tolerant of the source key
Update the `setProjectAudio` atomic update so it:
- Writes the resolved audio under `draftId`.
- Removes the `finalId` entry (as today).
- Leaves an existing `draftId` entry in place if no better audio was resolved (never overwrites good audio with nothing).

### 3. Pass the resolved audio to `restoreDraftAudio`
Call `restoreDraftAudio(draftId, resolvedAudio)` so the live `musicUrl`/`voiceoverUrl`/timeline state is repopulated from the resolved source (not just `projectAudio[finalId]`). `restoreDraftAudio` already persists the override under the draft scope, so the soundtrack survives refresh and is re-used when the film is finalized again.

### 4. Safety / non-regression
- No storage deletions; only key remapping in `projectAudio` (purely additive for the draft, removes the now-defunct final entry).
- Other projects' audio entries are untouched (we only read `finalId`/`draftId`).
- If no audio exists anywhere, behavior is unchanged (draft simply has no soundtrack).

## Verification
1. `bun run tsc --noEmit` clean.
2. Manual: take a Final Film that has music + narration, click the reopen (pencil) icon → confirm the music and voiceover chips/waveforms reappear under the preview and the timelines are set.
3. Refresh the page while in the reopened draft → soundtrack persists.
4. Re-run Final Film → output contains the same music + narration.
5. Reopen a Final Film that genuinely had no audio → no errors, no phantom soundtrack.

## Technical notes
- `draftId` is derived from `draft_group_id` (`draftIdForGroupUuid`) so the draft-scoped audio key matches the original draft that produced the film — this is what makes the fallback reliable across sessions.
- All updates remain inside the existing single atomic `setProjectAudio` pass to avoid the race that previously dropped audio.
