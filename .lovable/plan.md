# UI Overlap & Text-Box Audit Fix

Scope: presentation/CSS only in `src/modules/generator-ui/pages/DashboardPage.tsx` (plus the model pill span). No logic, data, or backend changes.

## Problems confirmed (live, desktop 1567px + mobile 390px)

1. **Header clusters overlap** — three separate `position: fixed` groups (left grid icon, left action cluster, centered Preview/Start over/Final film/Music/Voiceover cluster) collide below ~1100px and stack completely on mobile.
2. **Bottom composer second action row overflows** — Contact / Add character / Add product / Prompt spill past the composer card, slide under the right panel, and get clipped by a scroll arrow.
3. **Model pill text overflow** — "Wan 2.7 — Image to Video" overflows its pill without clean truncation.
4. **Right "Pending" panel overlaps header/composer on mobile** — no responsive stacking.

## Plan

### 1. Make the header responsive (primary fix)
- Wrap the centered cluster (line ~9085) so on small screens it no longer sits at `left-1/2` on the same row as the left cluster. Approach: hide non-essential text labels and allow the row to compress.
- Convert the three fixed clusters into a behavior where:
  - On `md+`: keep current layout.
  - Below `md`: collapse the centered action cluster (Preview/Start over/Final film/Music/Voiceover) into icon-only buttons with reduced gaps, and let the left cluster shrink to icons (drop the "No occasion"/"Your business" text labels under `sm`), preventing horizontal collision.
- Ensure clusters don't share the same horizontal band: give the centered cluster a max-width and `flex-wrap`/`overflow-x-auto` fallback so it never overlaps the left cluster.

### 2. Fix the bottom composer action row
- Constrain the composer's secondary action row to the composer card width (it currently overflows under the right panel).
- Replace the silent horizontal clip + `→` arrow with a proper horizontally scrollable row (`overflow-x-auto` with hidden scrollbar) OR allow wrapping so all buttons (Contact, Add character, Add product, Prompt) stay inside the card bounds.
- On mobile, ensure the composer respects viewport width (`max-w-[100vw]`, padding) so it doesn't run off the right edge.

### 3. Fix the model pill text overflow
- Add `truncate`/`max-w` + title attribute to the "Wan 2.7 — Image to Video" label span so it truncates cleanly with an accessible tooltip instead of inconsistent clipping.

### 4. Mobile stacking for the right "Pending" panel
- Ensure the right panel and bottom composer don't overlap the fixed header on small screens (add top padding/safe offset, and let the panel stack below the canvas under `lg`).

## Verification
- Re-run the Playwright audit at 1567px, 1100px, 768px, and 390px.
- Confirm: zero overlapping header buttons, no clipped composer buttons, model pill truncates cleanly, no element extends past viewport.
- Run typecheck + build.

## Notes
- Pure Tailwind/className changes; no changes to handlers, state, or generation logic.
