Goal
----
Add the ability to resize (scale up / scale down) the contact/branding overlay — both the logo and the text — alongside the existing drag-to-position feature. The chosen size is reflected live in the preview and burned into the Final Film.

Changes
-------

1. Data model — `src/modules/generator-ui/pages/DashboardPage.tsx`
   - Add `scale: number` to the `ContactOverlay` type (1 = default, range ~0.5–2.0).
   - Default `scale: 1` in `emptyContact()`. `updateContact`/localStorage already persist any new field automatically.

2. Resize control in the Contact popover (same panel as position controls)
   - Add a labeled row "Size" with a `Slider` (min 0.5, max 2, step 0.05) bound to `contactOverlay.scale`, calling `updateContact({ scale })`.
   - Add a small "Reset size" affordance when scale ≠ 1.

3. Live preview scaling — overlay block (`contactActive && !isMergedFinalPreview` around line 9041)
   - Apply the scale to the rendered overlay panel via a CSS transform (e.g. `style={{ transform: ... scale(contactOverlay.scale) }}`), keeping the existing `translate(-50%, -50%)` for the dragged case and adding `scale(...)` for the preset case via a wrapping transform. Logo `max-h` and text size scale together because the whole panel is transformed.
   - Transform origin centered so it grows/shrinks around its anchor point.

4. Burn-in scaling — `src/modules/generator-ui/lib/mergeVideos.ts`
   - Add optional `scale?: number` to `MergeOverlayOptions`.
   - In `drawOverlay`, multiply `fontSize` and the logo height factor (`ch * 0.12`) by `overlay.scale ?? 1` (clamped 0.5–2). All derived metrics (lineGap, padding, panel sizes) already key off `fontSize`/`logoH`, so the whole block scales consistently and stays clamped on-screen.

5. Wire-through at the merge call site
   - Pass `scale: contactOverlay.scale` into the overlay options where `lines/position/offset/logoUrl` are already passed (mergeVideos call in DashboardPage and the `activeOverlay` assignment in mergeVideos.ts).

Result
------
- Users can drag to position AND use a size slider to make the overlay bigger or smaller.
- Preview and Final Film render at the same chosen size.
- Defaults unchanged for existing users (scale falls back to 1).