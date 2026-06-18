## Fix: apply the single-icon download dropdown to the correct Library panel

### Root cause
The earlier edit changed the archive/history view (lines ~7527), but the UI the user sees (Library → Final Videos) is rendered by a different block at lines **9283–9318** (`variant === 'final'`). That block still renders the two separate buttons (download icon + `MP4` pill), so the UI looked unchanged.

### Change
In `src/modules/generator-ui/pages/DashboardPage.tsx`, replace the `<>...</>` fragment (lines 9284–9317) containing the two buttons with a single `DropdownMenu`:

- Trigger: one download icon button (keeps the same styling, `downloadingId === video.id` disabled/spinner state, and `event.stopPropagation()`).
- `DropdownMenuContent` with two items:
  - **Download as MP4** → `downloadAsMp4(video.id, video.video!.storage_path, 'final-film')`
  - **Download as WEBM** → `downloadDirect(video.id, video.video!.storage_path, 'final-film', 'webm')`

`DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, and `DropdownMenuItem` are already imported in this file, and `downloadDirect` already accepts the optional `forcedExt` argument from the previous change.

### Optional cleanup
The archive-view dropdown added earlier (line ~7527) is correct and can stay as-is for consistency.

### No other files change.