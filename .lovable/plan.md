## Goal

Let the user drag the contact/branding overlay anywhere on the video preview to choose its exact position, instead of being limited to the Top / Center / Bottom presets. The chosen position must persist and be burned into the final film at the same spot.

## How it works today

- `ContactOverlay` has `position: 'top' | 'center' | 'bottom'` only.
- Preview (`DashboardPage.tsx` ~line 8997) renders the overlay with preset CSS classes.
- Final film burn-in (`mergeVideos.ts` `drawOverlay`) places text/logo at top/center/bottom.
- Preferences persist per-user in `localStorage` (`project-contact:<userId>`).

## Plan

### 1. Extend the overlay model
- Add `offset?: { x: number; y: number } | null` to `ContactOverlay` (normalized 0–1 coordinates of the overlay's center relative to the video frame).
- `null` = use the existing preset (`position`) behavior, so nothing breaks for existing users.
- Persist `offset` alongside the other local prefs in `localStorage`.

### 2. Draggable overlay in the preview
- Make the overlay block draggable (pointer events) inside the video container.
- On drag, compute the pointer position relative to the video box, clamp to 0–1, and store it in `offset` via `updateContact`.
- When `offset` is set, position the block absolutely using `left/top` percentages with a centering transform; show a subtle "drag" affordance (cursor-move, faint ring on hover) so users know it's movable.
- Keep the overlay readable: retain the text shadow / translucent panel.
- Dragging sets `pointer-events` appropriately so the video controls underneath still work when not dragging.

### 3. Keep presets working alongside drag
- The Top / Center / Bottom buttons still work; clicking one clears `offset` (back to preset) OR maps to the corresponding offset. Chosen behavior: clicking a preset resets `offset = null` so the preset takes over again. Add a small "Custom" indicator when a manual position is active, plus a "Reset position" link.

### 4. Burn the custom position into the final film
- Extend `MergeOverlayOptions` in `mergeVideos.ts` with the optional `offset`.
- In `drawOverlay`, when `offset` is present, position the text/logo block centered at `offset.x * canvasWidth`, `offset.y * canvasHeight` (clamped so it stays fully on-screen), instead of the top/center/bottom layout.
- Pass `contactOverlay.offset` through the call site at `DashboardPage.tsx` ~line 6645.

### 5. Verify
- Preview drag updates position live and persists across reload.
- Preset buttons still work and reset custom position.
- Final film renders the overlay at the dragged location.
- No regression when `offset` is null (default preset behavior).

## Technical notes

- Files changed: `src/modules/generator-ui/pages/DashboardPage.tsx` (type, state, preview drag UI, contact menu controls, merge call site) and `src/modules/generator-ui/lib/mergeVideos.ts` (overlay option + `drawOverlay` offset placement).
- Coordinates stored normalized (0–1) so they map correctly across aspect ratios and the higher-resolution merge canvas.
- Drag uses pointer events with clamping; overlay center is the anchor for both preview and burn-in to keep them visually identical.
