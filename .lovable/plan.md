## Goal

On each finalized **Final Film** card, add an audio icon that reveals the music and/or voiceover used in *that specific project*, with play + download for each. If the project has no music and no voiceover, the panel shows an empty state.

## Background (current behavior)

`src/modules/generator-ui/pages/DashboardPage.tsx`
- Music/voiceover are workspace-global state: `musicUrl`/`musicName` and `voiceoverUrl`/`voiceoverName` (lines ~1846–1858). They are object/remote URLs and are mixed into the Final Film WebM at finalize.
- Finalization (lines ~5126–5320) builds the merged film entry (`mergedId`) and snapshots source clips into `projectSourceJobs[mergedId]`, but **does not** store the project's separate audio anywhere durable.
- An audio download helper already exists: `downloadAudioFile(audioId, url, name)` (line ~688). `Popover`/`PopoverContent`/`PopoverTrigger` and `Music2` icon are already imported. `MERGED_BUCKET = 'merged-videos'` is a public bucket already used for durable snapshots.

## The change (frontend only)

### 1. New persisted per-project audio map
Add `projectAudio` state: `Record<string, { music?: { url: string; name: string }; voiceover?: { url: string; name: string } }>`, persisted to `localStorage` under key `project-audio:${userId}`, with hydrate effect + `persistProjectAudio` helper — mirroring the existing `projectSourceJobs` pattern.

### 2. Snapshot the project's audio at finalize
In the finalize flow, right after `mergedId` is created and when `hasMusic`/`hasVoiceover` are known, persist durable public copies into `MERGED_BUCKET` so they survive refresh and are downloadable from a public URL:
- If music present: `fetch(musicUrl)` -> blob -> upload to `${userId}/project-music-${mergedId}.<ext>` -> `getPublicUrl` -> store `{ url, name: musicName ?? 'Music' }`.
- If voiceover present: same into `${userId}/project-voice-${mergedId}.<ext>` -> store `{ url, name: voiceoverName ?? 'Voiceover' }`.
- Set and persist `projectAudio[mergedId]` with whichever exist. Wrapped in try/catch with timeouts (reuse the pattern already used for source-clip snapshots) so a failed audio upload never blocks finalization.

### 3. Audio icon + popover on final cards
In `renderCard` for `variant === 'final'`, add a `Music2` icon button (next to Download/Reopen/Delete) wrapped in a `Popover`. The `PopoverContent` lists, for `projectAudio[video.id]`:
- A **Music** row (if present): name + a play control (inline `<audio controls>` or a play button) + a Download button calling `downloadAudioFile('music-'+video.id, music.url, music.name)`.
- A **Voiceover** row (if present): same pattern with `voiceover.url`.
- If neither exists: a muted "No music or voiceover for this project" empty state.
Use `event.stopPropagation()` on the trigger/buttons so clicks don't open the project preview.

### 4. Cleanup on delete / reopen
When a final film is deleted (`deleteCard`) or reopened as a draft (`reopenFinalAsDraft`), drop `projectAudio[finalId]` (+ persist) so stale audio doesn't linger.

## Notes / scope
- Single file: `DashboardPage.tsx`. No backend, schema, or business-logic changes.
- Only the project's own audio is shown; absence => empty state, exactly as requested.
- Existing finalized films created before this change won't have `projectAudio` entries (their audio wasn't snapshotted), so they show the empty state; this only affects already-finalized legacy items.
