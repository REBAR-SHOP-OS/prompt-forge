## Goal

Currently, the "+" icon at the top of the History panel only focuses the prompt textarea. The user wants this icon to start a completely fresh "new video" workflow — clearing the prompt, removing uploaded Start/End frames, deselecting the current preview, and bringing the composer to a clean state ready for a brand-new generation.

## Changes

### `src/modules/generator-ui/pages/DashboardPage.tsx`

Update `handleAddVideoCard` so it:

1. Clears the prompt: `setPromptText('')`
2. Clears uploaded frames (Start/End): `setUploadedFiles([])`
3. Clears any composer error: `setComposerError(null)`
4. Clears the column message: `setVideoColumnMessage(null)`
5. Resets the upload target: `setUploadTarget('Start')`
6. Deselects the currently previewed video: `setPreviewVideoId(null)` — so the main canvas no longer shows the previous render and is ready for the next one.
7. Closes the history panel on small screens (optional polish): `setIsHistoryPanelOpen(false)` only when viewport is narrow, OR keep it open — we'll keep it open to match current UX.
8. Focuses the prompt input (existing behavior).
9. Scrolls the composer into view (smooth) so the user immediately sees the empty card.

### Optional UX polish

- Add a subtle toast/inline hint ("New video card ready — add Start & End frames and a prompt") via the existing `videoColumnMessage` slot, OR rely solely on the empty composer state. Recommended: skip the toast, the empty state is self-explanatory.

### No backend / contract / migration changes

This is purely a frontend state-reset enhancement. No edge functions, no DB changes.

## Acceptance

- Clicking the "+" icon in the History panel:
  - Empties the prompt textarea
  - Removes both Start and End frame chips
  - Deselects any preview (main area returns to the empty/composer state)
  - Focuses the prompt textarea so the user can immediately type
- Submitting a new prompt with new frames creates a new job/card in History as before.
