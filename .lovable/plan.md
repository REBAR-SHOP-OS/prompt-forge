## Goal

Add a new "Regenerate" icon button to each generated card. When clicked it:

1. Re-runs the same prompt (and same frames + duration + aspect ratio) for that card as a brand-new job.
2. Permanently deletes the previous card and its video file (server + storage), so only the freshly generated version remains.

This is independent of the existing trash icon — trash still does the explicit user-initiated permanent delete, and Final-Film/library cards remain protected (only the user can remove them via their own trash icon).

## UI changes (`src/modules/generator-ui/pages/DashboardPage.tsx`)

In both card action rows where the existing trash button lives (around lines ~3104–3141 for the main card, and ~3340–3365 for the secondary/preview card view), add a new icon button right before the trash button:

- Icon: `RotateCcw` from `lucide-react` (already-style consistent with existing 7×7 round buttons).
- `aria-label` / `title`: "Regenerate (replaces this card)" — Persian tooltip is not required since other tooltips here are English.
- Same Tailwind classes as siblings, with hover accent in amber to differentiate from delete (rose) and edit (emerald).
- `onClick` calls a new `regenerateCard(video)` handler with `event.stopPropagation()`.
- Disabled while the card is in `pending` / `processing` to avoid double-fire, and while a regenerate is already in flight for that id.

## New handler `regenerateCard(video)`

Add next to `editAndReuseJob` (~line 1707). Behaviour:

1. Guard: require `video.id` and a non-empty `video.input_prompt`. If missing prompt, show `setComposerError("This card has no prompt to regenerate.")` and abort.
2. Build the same payload that originally created the job:
   - `providerKey: 'wan'`
   - `prompt: video.input_prompt`
   - `firstFrameUrl: video.first_frame_url ?? undefined`
   - `lastFrameUrl: video.last_frame_url ?? undefined`
   - `durationSeconds: video.duration_seconds ?? durationSeconds`
   - `aspectRatio: rememberedRatioFor(video.id) ?? aspectRatio`
   - If neither frame is present and the job had no frames, fall back to text-to-video model (`wan2.7-t2v-2026-04-25`) like `handleSubmit` does for the `isTextToVideo` branch.
3. Call `jobOrchestratorGateway.createJob(...)` to enqueue the new job, get `createdJob`.
4. Build seeded job via existing `buildSeededJob(...)` and insert it into `generatedVideos` via `mergeJob`, set `previewVideoId` to the new id.
5. **Only after the new job is successfully enqueued**, call the existing `deleteCard(video.id)` helper to permanently remove the previous card. Order matters: enqueue first, delete second — so a failed enqueue never destroys the original. Wrap delete in its own `try/catch` and surface a non-blocking toast/console warn if cleanup fails (the new job is already running).
6. Track in-flight ids in a small `regeneratingIds` `Set` state to disable the button per-card.

`deleteCard` already handles backend job + storage delete, library/approved cleanup, and edited-clip removal — no new delete logic needed.

## Out of scope

- No backend / edge function / migration changes.
- No changes to Final-Film cards stored in the Library — those still follow the rule "only the user's trash icon can remove them".
- No change to existing trash, edit, trim, or save-to-library buttons.

## Technical notes

- `RotateCcw` import: extend the existing `lucide-react` import block at the top of the file.
- Aspect ratio recall: a `rememberClipRatio` map already exists; expose / read it through the existing helper used elsewhere when re-rendering, otherwise default to current composer `aspectRatio`.
- The new button must be added in **both** card-render locations to keep behavior consistent across the main grid view and the preview list view.
