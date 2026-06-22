## Goal
When the user picks a duration inside the **Product Ad Scenario** (or **Scenario Writer**) dialog and then sends it to the prompt, the main toolbar/prompt duration must update to match that selection (e.g. pick 30s in the dialog → main prompt shows 30s). The user can still change it afterward in the toolbar.

## Current behavior
- The dialog already receives `defaultDuration` from the toolbar, so it opens pre-set to the current toolbar duration. ✅
- But when the user changes the duration inside the dialog and clicks **Use as prompt** / **Send**, the chosen duration is NOT sent back. The callbacks `onUseAsPrompt(scenario, imageUrl)` and `onSendScenes(scenes, imageUrl)` carry no duration, so `durationSeconds` in `DashboardPage` stays unchanged. ❌

## Change (frontend only)
Pass the dialog's selected `duration` back through the callbacks and apply it to the toolbar state.

### 1. `src/modules/generator-ui/components/ProductAdDialog.tsx`
- Extend prop types:
  - `onUseAsPrompt: (scenario: string, imageUrl?: string, duration?: ProductAdDuration) => void`
  - `onSendScenes?: (scenes: string[], imageUrl?: string, duration?: ProductAdDuration) => void | Promise<void>`
- In `handleUseAsPrompt` pass `duration`: `onUseAsPrompt(scenes.join('\n\n'), frameUrl, duration)`
- In `handleSendAll` pass `duration`: `await onSendScenes(scenes, frameUrl, duration)`

### 2. `src/modules/generator-ui/components/ScenarioWriterDialog.tsx`
- Same signature extension with `ScenarioDuration`.
- Pass `duration` in both `onUseAsPrompt(...)` and `onSendScenes(...)` calls.

### 3. `src/modules/generator-ui/pages/DashboardPage.tsx`
- In the `<ProductAdDialog>` and `<ScenarioWriterDialog>` JSX handlers (around lines 8366–8412), update the callbacks to receive the `duration` argument and call `setDurationSeconds(duration)` when provided, before/alongside setting the prompt text.

```text
onUseAsPrompt={(text, imageUrl, duration) => {
  if (duration) setDurationSeconds(duration)
  setPromptText(text)
  ...
}}
onSendScenes={async (scenes, imageUrl, duration) => {
  if (duration) setDurationSeconds(duration)
  ...
}}
```

## Why this is safe
- Purely additive optional parameter; existing calls without `duration` still work.
- `durationSeconds` and the dialog durations share the same union (`5 | 10 | 15 | 30 | 45 | 135`), so no type mismatch.
- No backend, schema, or generation-logic changes.

## Validation
- Build passes automatically.
- Manual: open Product Ad dialog, set 30s, Use as prompt → toolbar shows 30s; confirm toolbar can still be changed manually afterward.
