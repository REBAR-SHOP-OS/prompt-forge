## Problem

Uploading a music file and confirming the soundtrack dialog automatically renders the Final Film (calls `handleMergeAllVideos`). The user wants the soundtrack to just be attached/saved — Final Film should only be generated when the user explicitly triggers it.

## Fix (frontend only — `src/modules/generator-ui/pages/DashboardPage.tsx`)

Edit the dialog footer button (≈ lines 2539–2554):

- Remove the auto-merge call. The Done button just closes the dialog and persists the soundtrack selection (`musicUrl`, `musicRange`, `soundtrackMode`, volumes) — which is already handled by existing state setters.
- Always label the button **"Done"** (drop the "Apply to Final Film" variant and the `isMerging` "Applying…" state, since merging is no longer triggered here).
- New `onClick`: simply `setIsMusicDialogOpen(false)`.

The existing Forge / Final Film trigger elsewhere (`onClick={handleMergeAllVideos}` on the merge button at line 2333) remains the single explicit entry point for rendering, and it already reads `musicUrl` + `musicRange` when building `audioOpt`. So the soundtrack will still be applied — just only when the user explicitly forges.

No changes to merge logic, gateway, backend, or schema.

## Verification

- Upload a music file → soundtrack dialog opens → click Done → dialog closes, audio chip appears in the top tabs, **no Final Film render starts** (no progress spinner, no merge job).
- Click the explicit Forge/Final Film button afterwards → Final Film renders with the chosen music range applied.
- Clear soundtrack via the X chip → audio is detached, subsequent Final Film renders without music.