# Fix the Regenerate icon on History cards

## What the user wants
Clicking the circular ↻ icon on a History card must:
1. Delete that card (and its video) — already works
2. Immediately create a NEW card using the same prompt / start frame / end frame / aspect ratio / model — currently fails (card is removed but no new card appears)

## Root cause investigation
The handler `regenerateJob` in `src/modules/generator-ui/pages/DashboardPage.tsx` already does delete-then-create. The most likely reasons the new card is not appearing in the user's case:

- The `createJob` call throws (e.g. `VALIDATION_ERROR`, `INVALID_FIRST_FRAME_URL`, or the previous job's frame URL no longer passes `isAllowedFrameUrl` in `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`).
- The error is shown via a blocking `window.alert` and the rollback path runs, leaving no new card behind.
- `durationSeconds` sent to the backend is the *current composer* value, not what the original job used — schema only allows `5 | 10 | 15`, but if state is somehow out-of-range the call rejects.

## Fix plan (frontend-only, in `DashboardPage.tsx`)

1. **Make regenerate non-blocking and observable**
   - Remove the `window.confirm("Replace this clip…")` prompt — the icon click is itself the intent.
   - Replace `window.alert(...)` failure paths with the existing inline error surface (`setComposerError` / `setVideoColumnMessage`) so the user actually sees what went wrong instead of a silent rollback.
   - Log the underlying error to `console.error` for debugging.

2. **Carry over the original clip's parameters faithfully**
   - Reuse the original job's stored values where available: `firstFrameUrl`, `lastFrameUrl`, `provider_key`, `model_key`, and the per-clip ratio from `clipAspectRatios[oldId]`.
   - Clamp `durationSeconds` to a valid `5 | 10 | 15` (default to `5` if the current state is out of range).
   - Drop frame URLs that don't pass a quick same-origin / `wan-frames/<userId>/` check before sending — so we don't trip the backend validator and lose the card.

3. **Two-step UI: insert placeholder first, then swap on success**
   - Insert the seeded "pending" card at the old card's index *before* awaiting the network call, so the History column never visibly empties.
   - On `createJob` success, swap the placeholder id for the real `created.jobId`, transfer `approvedIds` / `librarySavedJobs` from old → new id (already implemented), and seed `clipAspectRatios[newId]` with `effectiveRatio`.
   - On failure, remove the placeholder, restore the old card from the snapshot, and show the inline error.

4. **Make sure the polling loop picks up the new card**
   - The existing effect at line 1538 watches `generatedVideos` for non-terminal jobs and polls — by inserting the seeded job before the await, the poller will already be tracking it when `createJob` resolves.

## Verification
- Click ↻ on a text-to-video card → old card disappears, a new "pending" card appears in the same position, status flips to processing, then completed.
- Click ↻ on an image-to-video card with a Start frame → same flow, frame is reused.
- Force a failure (e.g. invalid frame URL) → old card returns, inline error message is visible, no silent loss.

## Files changed
- `src/modules/generator-ui/pages/DashboardPage.tsx` — `regenerateJob` only.
- No backend / schema / RLS changes.
