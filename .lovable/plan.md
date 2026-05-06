## Goal

When the user clicks **Done** in the Soundtrack dialog, the chosen audio settings (Music only / Mix with volumes) must be applied to the Final Film immediately — not just saved silently.

Currently `Done` only closes the dialog. The merge runs only when the user separately clicks the Final Film button. So changing audio settings after a film exists has no visible effect.

## Change

In `src/modules/generator-ui/pages/DashboardPage.tsx` (Done button, ~line 1867):

- Rename the action from "Done" to **"Apply to Final Film"** when there are ≥ 2 completed clips (otherwise keep "Done").
- On click:
  1. Close the dialog.
  2. If not already merging and there are ≥ 2 finished source clips, trigger `handleMergeAllVideos()` so a new Final Film is rendered with the new audio settings.
- Disable the button while `isMerging` is true and show "Applying…" label.

```tsx
<Button
  type="button"
  disabled={isMerging}
  onClick={() => {
    setIsMusicDialogOpen(false)
    if (!isMerging && completedSourceVideos.length >= 2) {
      void handleMergeAllVideos()
    }
  }}
>
  {isMerging
    ? 'Applying…'
    : completedSourceVideos.length >= 2
      ? 'Apply to Final Film'
      : 'Done'}
</Button>
```

## Out of Scope

- No change to the merge pipeline itself (volumes are already wired through `handleMergeAllVideos` → `mergeVideoUrls`).
- No automatic re-merge on every slider change — only on explicit Apply click.
