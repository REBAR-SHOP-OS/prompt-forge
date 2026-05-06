## Goal

Add a small **animated visual preview** next to each transition option in the "Transition" dropdown (Cut, Fade, Crossfade, Slide ←, Slide →, Wipe, Zoom) so users can see what each effect looks like before picking one. Also show a tiny preview thumbnail next to the selected transition label on the inline pill button.

## Current State

In `src/modules/generator-ui/pages/DashboardPage.tsx` (lines ~1855–1882), the transition dropdown lists each option as plain text only. Users have to guess what each effect does. Reference image shows the current text-only menu (Transition / Fade / Crossfade / Slide ← / Slide → / Wipe / Zoom).

## Plan

### 1. New component: `TransitionPreview.tsx`
Location: `src/modules/generator-ui/components/TransitionPreview.tsx`

A small (~32×20 px) self-contained animated thumbnail that depicts each transition between two colored "A" and "B" panels. It uses `requestAnimationFrame` to loop a 0→1 progress value with a short hold at start/end, then renders the two panels using transform/opacity/clip-path:

- **Cut** — instant swap at the midpoint
- **Fade** — A fades to black, then B fades in
- **Crossfade** — A opacity 1→0 while B opacity 0→1 simultaneously
- **Slide ←** — A slides out left while B slides in from right
- **Slide →** — A slides out right while B slides in from left
- **Wipe** — vertical wipe from left to right via `clip-path`
- **Zoom** — A scales up + fades out while B scales up + fades in

Props: `id: TransitionId`, `size?: number`, `loop?: boolean` (default true).

The animation runs continuously while the dropdown is open (and on the inline pill — see step 3). Cleanup cancels the RAF on unmount.

### 2. Update the transition dropdown
In `DashboardPage.tsx` (lines 1870–1880):
- Render each `DropdownMenuItem` with a flex layout: `<TransitionPreview id={opt.id} />` on the left, label on the right.
- Slightly widen the menu (`min-w-[12rem]`) to accommodate the thumbnails.

### 3. Update the inline pill trigger
In `DashboardPage.tsx` (lines 1856–1866):
- Replace the `Sparkles` icon with `<TransitionPreview id={transitionId} size={22} />` so the user sees a live mini-preview of the currently selected transition right on the timeline.
- Keep the text label next to it.

### 4. Styling
- Use semantic-friendly inline colors for the A/B panels (a blue and an amber tone) so the motion is clearly visible against the dark UI.
- Rounded corners (3 px) and a subtle `border-white/15` to match existing pill/menu chrome.

## Out of Scope
- No changes to the actual `mergeVideos` rendering logic — previews are illustrative only and live entirely in the UI layer.
- No new dependencies.
