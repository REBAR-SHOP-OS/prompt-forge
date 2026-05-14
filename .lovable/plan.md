## Problem
AI-generated and uploaded image cards leak across every Library project. When the user opens a different project from Library, the workspace shows the project's video clips correctly (filtered via `projectSourceJobs[selectedProjectId]`), but `visibleUserImages` is just `userImages` with no project scoping — so every image ever created appears inside every project.

The same goes for the "fresh workspace" view: `workspaceHiddenJobIds` hides past video clips after Final Film / Start Over, but there's no equivalent for images, so old images keep showing too.

## Fix (frontend only — `src/modules/generator-ui/pages/DashboardPage.tsx`)

Mirror the existing job-side scoping for images:

1. **Add `projectSourceImages`** — `Record<string, UserImageItem[]>`, persisted in localStorage under `project-source-images:${userId}`. Same load/save pattern as `projectSourceJobs`.

2. **Add `workspaceHiddenImageIds`** — `Set<string>`, persisted under `workspace-hidden-images:${userId}`. Same pattern as `workspaceHiddenJobIds`.

3. **Filter `visibleUserImages`** (≈ line 1199):
   - If `selectedProjectId` set → return `projectSourceImages[selectedProjectId] ?? []` (with live entries from `userImages` preferred when ids match, fallback to snapshot).
   - Else → `userImages.filter(i => !workspaceHiddenImageIds.has(i.id))`.

4. **Snapshot images at merge time** (in the merge handler, alongside the existing `sourceJobs` snapshot ≈ line 2436):
   - Walk `eligibleClips`, collect ones with `kind === 'image'` (in film order), look them up in `userImages` (fallback to `projectSourceImages[selectedProjectId]` for re-merge, then to `clip.image`).
   - Write into `projectSourceImages[mergedId]` (state + persist).
   - Add their ids to `workspaceHiddenImageIds` so they disappear from the fresh workspace, parallel to the existing job-hide block.

5. **Start Over (`resetWorkspace`)** — Add a block parallel to the `workspaceHiddenJobIds` one that adds every current `userImages` id to `workspaceHiddenImageIds` and persists. This keeps existing behavior (images stay in their project but vanish from the fresh workspace).

6. **Delete project (`deleteCard` for merged ids)** — Drop the entry from `projectSourceImages` so deleted projects don't leave dangling image snapshots. Also, when deleting an individual image (existing handler at line 1385), prune it from every `projectSourceImages` entry.

7. **Hydration on mount** — load both new keys from localStorage when `userId` becomes known, same as the existing pattern.

### Out of scope
- No backend, schema, or `generator_user_images` changes — this is purely a client-side scoping fix.
- No change to videos / Library / merge logic / Start Over behavior beyond mirroring images.

## Verification
- Generate an AI image in project A → merge into Final Film → start a new project → the AI image is gone from the workspace.
- Open project A from Library → its AI image and clips reappear; project B (different one) shows only its own cards.
- Delete a merged project → its image snapshot is gone, no orphans.
- Refresh the page → snapshots and hidden sets persist, projects still show only their own cards.