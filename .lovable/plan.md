## Problem
Clicking a Draft project card in the Library sets `selectedProjectId = "draft-<uuid>"`, but the main workspace stays empty ("Start forging a prompt") because the draft's snapshot is only **rendered** via `displayedVideos` / `visibleUserImages` when other panels read from those — it is never **restored into the live workspace** the way a finalized project is via `resumeSelectedProject()`. So the user sees nothing even though the draft has clips (`1 CLIP` badge on the card).

For finalized projects there is a manual "resume" path triggered by actions (Final Film, new prompt, etc.). For drafts, the natural expectation is: **opening the draft = working on it**, so its content must appear immediately.

## Fix — `src/modules/generator-ui/pages/DashboardPage.tsx`

1. **Extract a helper** `openLibraryEntry(video: JobDetail)` that:
   - sets `lastMergedPreview = null`, `previewVideoId = video.id`, `isApprovedPanelOpen = false`, `previewDismissed = false`,
   - sets `selectedProjectId = video.id`,
   - if `video.id.startsWith('draft-')`: also restore the draft into the live workspace, mirroring `resumeSelectedProject` but using the just-set id (no need to wait for state):
     - read `draftSourceJobs[video.id] ?? []` and `draftSourceImages[video.id] ?? []`,
     - merge clips into `generatedVideos` (via existing `mergeJob`) and un-hide them from `workspaceHiddenJobIds`,
     - merge images into `userImages` and un-hide them from `workspaceHiddenImageIds`,
     - `setActiveDraftId(video.id)` + `persistActiveDraftId(video.id)` so the auto-snapshot effect keeps writing back to this same draft (no new draft is spawned),
     - clear `selectedProjectId` back to `null` after restoring (a draft is the live workspace, not a frozen snapshot view — same as Start Over behavior; this also makes HISTORY render normally instead of through the snapshot branch).

2. **Wire the helper into the existing card click + Enter/Space handlers** at lines ~5874 and ~5881 (replace the two inline blocks with `openLibraryEntry(video)`). Finalized cards keep today's behavior (snapshot view) because the `draft-` branch is skipped for them.

## Out of scope
- No change to `resumeSelectedProject` (still used by generate/Final Film paths for finalized projects).
- No change to the auto-snapshot effect, cover scoping, or backfill logic.
- No change to deletion, Library list, or the Pending column.

## Verification
- Click the Draft card in Library → its clip(s)/image(s) appear in HISTORY and become the active workspace; the auto-snapshot effect keeps the same `draft-<uuid>` updated (no duplicate draft).
- Click a finalized Final Film card → unchanged (snapshot-view + Saved badge still work).
- Refresh after opening a draft → workspace still shows the draft content (persisted via `activeDraftId` + `draftSourceJobs`).
