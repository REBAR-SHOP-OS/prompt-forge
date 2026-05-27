## Problem
Right now `coverScopeKey = selectedProjectId ?? activeDraftId ?? '__workspace__'`. The `__workspace__` fallback creates a "global" cover that appears whenever no project/draft is active, which feels like the cover is leaking between projects. The user wants covers to belong only to their own project.

## Edits in `src/modules/generator-ui/pages/DashboardPage.tsx`

1. **Remove the workspace fallback** (line ~2211):
   ```ts
   const coverScopeKey: string | null = selectedProjectId ?? activeDraftId ?? null
   const currentCover: UserImageItem | null = coverScopeKey ? (coverImages[coverScopeKey] ?? null) : null
   ```

2. **Guard the cover camera button** in the Pending header (line ~5248) and the "Replace" button (line ~5334): if `coverScopeKey` is `null`, render the button as `disabled` with `title="Open or create a project first"` and skip opening `AiImageDialog`.

3. **Guard `onSaved` for cover mode** (line ~4675): if `coverScopeKey` is `null`, bail out (show toast "Select a project to attach a cover") instead of writing to `coverImages`.

4. **One-time cleanup of leaked workspace cover**: in the `useEffect` that loads `coverImages` from localStorage (~line 872), after parsing, drop any `__workspace__` key and re-persist so old global covers disappear and never reappear in another project.

## Out of scope
- No change to per-project scoping logic that already works (`coverImages[projectId]`).
- No change to `AiImageDialog`, generation flow, or Library.
- No change to the Sparkles (frame) button.
