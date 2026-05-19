## Goal

Make the Regenerate (↻) button on a Pending/Ready card produce a new video **in the same card slot** (same visual position), using the original card's prompt / frames / aspect / duration. The old card disappears as soon as the replacement seed appears.

## Approach

Keep the existing `regenerateCard` flow (same prompt/frames/provider/model/aspect), but:

1. Derive duration from the original card when available:
   - prefer `Math.round(job.video.duration)` clamped to `5 | 10 | 15`,
   - else fall back to `5`.
2. After `createJob` returns and `buildSeededJob` produces the new pending job, **replace** the old job in `generatedVideos` at its current index instead of merging at the top.
3. Move active-job tracking and `regeneratingIds` from the old id to the new id (so the spinner stays on the same slot until polling resolves).
4. Update `previewVideoId` from old → new id if it pointed at the old card.
5. Fire-and-forget `jobOrchestratorGateway.deleteJob(oldId)` so the old job (and its video asset, if any) is removed from the backend. Failures are logged to `videoColumnMessage` but don't block the new render.

## Files

### `src/modules/generator-ui/pages/DashboardPage.tsx` — `regenerateCard`

- Compute `durationSeconds` from `job.video?.duration` when present (round to nearest of `5/10/15`).
- Capture the old card's index in the current `generatedVideos` list before the async call.
- Replace logic after `createJob` succeeds:
  ```ts
  setGeneratedVideos((curr) => {
    const idx = curr.findIndex((j) => j.id === job.id)
    if (idx < 0) return mergeJob(curr, seededJob)
    const next = [...curr]
    next.splice(idx, 1, seededJob)
    return next
  })
  ```
- `setPreviewVideoId((cur) => (cur === job.id ? seededJob.id : cur))`.
- Migrate `regeneratingIds`: remove `job.id`, add `seededJob.id`. Update the `finally` cleanup to use the new id.
- After local state swap, call `jobOrchestratorGateway.deleteJob(job.id).catch(...)`.
- `markActiveJob(seededJob.id)` keeps polling on the new id.

## Out of scope

- No backend/SQL changes (the `non-terminal` UPDATE guard makes in-place mutation of completed jobs impossible from the client, so we create-new-then-delete-old instead — visually identical, same id is not reused).
- No change to long-form (45s scenario) cards.
- No UI restyling of the icon or button.

## Verification

- Click ↻ on a Ready card → that exact card slot shows the regenerating spinner, no duplicate card appears at the top.
- When the new render completes, the new video plays in the same slot; the old card is gone from Pending and from the backend list.
- If the original card had a Start/End frame and a non-default aspect ratio, the regenerated clip uses the same values.
- If the original was a completed 10s or 15s clip, the regenerated clip is the same duration.
