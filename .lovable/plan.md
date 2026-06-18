## Goal

Make the copyright check on each saved **Final Film** run **automatically once**, and turn its library icon into a colored status indicator:

- 🟢 **Green** = approved (no copyright risk)
- 🟡 **Amber** = caution (uncertain, human should review) — kept as a middle state since the AI returns three verdicts
- 🔴 **Red** = rejected (clear copyrighted material)
- ⚪ Neutral/spinner = not yet checked / currently checking

Clicking the icon still opens the existing details dialog (and allows a manual re-check).

## How it works today

- In `DashboardPage.tsx`, each final video shows a `Shield` icon button that, on click, calls `runCopyrightCheck(video)` → invokes the `copyright-check` edge function → shows a dialog with the verdict (`approved` / `caution` / `rejected`).
- The result lives only in transient component state for the single open job; nothing is persisted, and nothing runs automatically.

## Plan

### 1. Persist per-video copyright status (no DB migration)
Reuse the existing library-state sync mechanism (`libraryState.ts`), which already mirrors localStorage keys to the backend and across devices.

- Add a new tracked prefix `copyright-status` to `TRACKED_PREFIXES`.
- Store a JSON map keyed by job id:
  ```text
  { [jobId]: { verdict: "approved"|"caution"|"rejected", summary?, checkedAt } }
  ```

### 2. Status state in DashboardPage
- Add a `copyrightStatuses` state (the map above), hydrated from the `copyright-status:${userId}` localStorage key on load, and written back when results arrive (so the sync layer pushes it to the backend).
- Update `runCopyrightCheck` to save the verdict into this map on success (both auto and manual runs).

### 3. Automatic one-time check
- Add an effect that, when the final videos list is ready, finds final videos that have a `storage_path` but **no stored status** and runs the check for them.
- Run sequentially / throttled (one at a time) to avoid hitting AI rate limits, and guard against duplicate in-flight checks per job id.
- Already-checked videos are skipped on every subsequent load (so credits aren't wasted). A manual click can always force a fresh re-check.

### 4. Colored icon
Replace the static violet `Shield` button styling with color driven by the stored status:
- approved → emerald (green)
- caution → amber
- rejected → rose (red)
- checking → spinner; unchecked → current neutral zinc
The click handler keeps opening the existing dialog.

## Technical notes
- Files touched: `src/modules/generator-ui/lib/libraryState.ts` (add prefix) and `src/modules/generator-ui/pages/DashboardPage.tsx` (state, effect, icon styling, persistence in `runCopyrightCheck`).
- No schema/edge-function changes required; the existing `copyright-check` function and `generator_library_state` table cover persistence.
- Non-breaking: the manual click-to-open-dialog behavior is preserved; only icon color and an auto-trigger are added.
</content>
<parameter name="summary">Auto-run the copyright check once per saved Final Film and color its library icon green (approved) / amber (caution) / red (rejected), persisting results via the existing library-sync mechanism.