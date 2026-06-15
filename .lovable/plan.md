## Goal

Move the "Live preview all cards" action from the right-side Pending panel header to the marked spot at the top of the preview area, give it a clear label so the user understands what it does, and make live preview the always-on default that auto-runs.

## Changes (all in `src/modules/generator-ui/pages/DashboardPage.tsx`)

### 1. Add a labeled control at the top of the preview area
In the `<main>` preview region (the 56px top zone at line ~7438-7442), add a centered, clearly-labeled button placed in the marked area above the video. Instead of a bare icon, it shows an icon + text so its purpose is obvious:

```text
[ ▷  Live preview — play all cards ]
```

- Uses the existing `Play` icon plus a visible text label (not just a tooltip), with `title`/`aria-label` for accessibility.
- Clicking it runs the full live sequence: `setPreviewVideoId(null)`, `setPreviewDismissed(false)`, and clears any `videoColumnMessage`.
- It is shown whenever `playableSequenceClips.length >= 2` (i.e. whenever a live preview is possible).
- It is styled as "active/live" by default (e.g. emerald accent) when the current `previewItem.kind === 'sequence'`, so the user can see the live preview is the running default.

### 2. Remove the duplicate icon from the Pending panel header
Remove the bare `Play` "Live preview all cards" button (lines ~7779-7795) from the working-clips header, since the action now lives at the marked location above the preview.

### 3. Keep live preview as the default that always runs
The default already resolves to the sequential live preview when 2+ clips exist (`previewItem` logic, lines ~3307-3312) and `SequentialClipPlayer` auto-plays (`isPlaying` defaults to true). No logic change needed beyond making the new control reflect/return to that default state. The new labeled button guarantees the user can always re-trigger the live default in one click.

## Verification
- With 2+ ready cards, open the workspace → the labeled "Live preview" control appears centered above the video and the full sequence auto-plays.
- Click a single card → preview switches to that card; the labeled control stays visible and, when clicked, returns to the live sequence and plays.
- The old icon no longer appears in the Pending panel header.
