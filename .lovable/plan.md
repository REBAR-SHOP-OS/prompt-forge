## Problem
After a hard refresh on `/app`, the workspace looks blank: HISTORY shows 0, and the middle Final Film preview is gone, even though the user just rendered/merged a video. This happens because the mount effect at `DashboardPage.tsx:1271` intentionally wipes state and never re-hydrates from the backend, and `selectedProjectId` / `previewVideoId` aren't persisted.

## Goal
After refresh, the user should see exactly what they had before refresh:
- HISTORY column repopulated with their recent renders.
- The middle "SHOWING PROJECT — Final Film" preview reopened on the same project they were viewing.

## Fix (frontend only — `src/modules/generator-ui/pages/DashboardPage.tsx`)

1. **Hydrate HISTORY on mount** — Replace the mount-clear effect with one that:
   - Calls `videoLibraryGateway.listMyVideos()` is unrelated; use the existing render pipeline: fetch summaries via the same path used elsewhere (`jobOrchestratorGateway.listMyJobs` shape via `hydrateJobs`). The file already imports `JobSummary`/`hydrateJobs`. Call the existing list endpoint (jobs-list) through a small helper or via `request('/jobs-list')` already used by other gateways, then `hydrateJobs(...)` and `setGeneratedVideos(...)`.
   - Sets `isLibraryLoading` true → false around the call.
   - Still resets ephemeral input state (`videoColumnMessage`, `userImages`) like before.
   - Runs only when `userId` becomes available (so authed user is known).

2. **Persist `selectedProjectId`** — Add a `selected-project:${userId}` localStorage key:
   - Hydrate on mount (after `userId` known).
   - Update `setSelectedProjectId` callsites by writing through a small wrapper or a `useEffect([selectedProjectId, userId])` that persists/clears the value.
   - On hydrate, only restore if a matching entry exists in `mergedEntries` or hydrated `generatedVideos`; otherwise drop it (avoids ghost project state).

3. **Persist `previewVideoId` + `previewDismissed`** — Same pattern with `preview-video:${userId}` and `preview-dismissed:${userId}` keys, hydrated/cleared per `userId`. Restore only if the id resolves to a known clip/merged entry.

4. **Validate after hydrate** — After the initial `setGeneratedVideos(hydrated)`, run the same prune that already exists for `approvedIds` so dangling persisted ids are cleaned up.

## Out of scope
- No backend or schema changes.
- No changes to Library, deletion, merge, or generation flows.
- No change to "Start Over" — it still wipes everything (incl. the new persisted keys via existing `resetWorkspace`).

## Verification
- Render a clip → merge into Final Film → refresh page → HISTORY still shows the clip(s) and the Final Film preview re-opens on the same project.
- Click X on the preview → refresh → preview stays dismissed.
- Click "Start Over" → refresh → workspace empty as expected.
- Log out / log in as another user → no leakage (keys are scoped by `userId`).