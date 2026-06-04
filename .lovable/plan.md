# Fix: random videos appear in Pending after a page refresh

## Symptom
The workspace looks empty (`Pending 0`, "No renders yet"), but after a browser refresh several old videos suddenly appear in the Pending / Working-clips column.

## Root cause
The Pending column is rendered from `displayedClips` → `displayedVideos`. In its default (no selected project) branch, `displayedVideos` returns **every** job in `generatedVideos`, only removing:
- jobs hidden via `workspaceHiddenJobIds`, and
- jobs claimed by another project or a **non-active** draft snapshot.

On refresh, the hydration effect reloads **all** of the user's past jobs from the backend into `generatedVideos`. Any job that is neither hidden nor already owned by another draft/project is "loose", so it falls straight into the default list and shows up in Pending.

The app tries to paper over this with the "orphan backfill" effect, which later stamps each loose job into its own `draft-orphan-<id>` so it becomes "claimed" and disappears. But that effect runs **after** mount and asynchronously, so on every refresh the loose jobs flash/persist in Pending before (or instead of) being reclassified. This is fragile by design: Pending is defined as "everything minus exclusions" instead of "only the active chain".

## Principled fix
Pending must show **only the active working chain**, never the full job history. The app already tracks active-chain membership authoritatively in `activeJobIds` (every clip added to the workspace goes through `markActiveJob`/`markNewClip`; `Start Over` clears it). So the default branch of `displayedVideos` should additionally require `activeJobIds.has(id)`.

Result:
- After `Start Over` or on a fresh/empty workspace, `activeJobIds` is empty → Pending stays empty across refreshes.
- Freshly generated/uploaded/derived clips (all of which call `markActiveJob`) still appear immediately.
- Old backend jobs that aren't part of the current chain never leak in, regardless of draft/orphan timing.

Apply the same active-chain gate to `lockedRatio`'s "live videos" computation so the aspect-ratio lock is also driven by the active chain rather than loose history.

## Changes (single file: `src/modules/generator-ui/pages/DashboardPage.tsx`)
1. **`displayedVideos`** (default branch, ~line 2540): change the filter
   from `!workspaceHiddenJobIds.has(v.id) && !claimedByProjects.has(v.id)`
   to also require `activeJobIds.has(v.id)`. Add `activeJobIds` to the memo dependency array (~line 2559).
2. **`lockedRatio`** (~line 2437): change the `liveVideos` filter to also require `activeJobIds.has(v.id)` and add `activeJobIds` to its dependency array (~line 2463), so the chain lock follows the active chain too.

No backend, schema, or other component changes. The orphan-backfill / Library-draft logic is left intact (it still builds Library cards from history); it simply no longer governs what Pending shows.

## Verification
1. Generate or upload a clip → it appears in Pending.
2. Refresh → the same active clip(s) persist, and no extra/old videos appear.
3. Click `Start Over` → Pending empties; refresh again → Pending stays empty (no resurrected videos).
4. Confirm Library still shows previous projects/drafts (history is untouched).
