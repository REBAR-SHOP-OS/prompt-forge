# Fix: Contact overlay looks bigger in the Final Film than in preview

## Problem
The Contact overlay (website / phone / address + logo) appears noticeably **larger** in the rendered Final Film than in the live preview.

## Root cause
The live preview and the burn-in use two different sizing systems:

- **Live preview** (`DashboardPage.tsx`, ~line 9044): fixed pixel sizes that never change with the video size — text is `text-sm` (14px), logo is `max-h-16` (64px), padding `px-5 py-4`, etc.
- **Final film burn-in** (`mergeVideos.ts`, `drawOverlay`, ~line 299): sizes are a **percentage of the actual video height** — `fontSize = ch * 0.032`, `logoH = ch * 0.12`, with padding/gap/radius all derived from `fontSize`.

For a vertical 1080×1920 video the burn-in text is ~61px relative to the full frame (3.2%), but the preview shows fixed 14px on a much smaller, scaled-down video element. The two no longer represent the same proportion, so the final output looks bigger. The recently added `scale` multiplier is applied to both, so it is not the cause — the base ratios simply don't match.

## Fix (frontend only, preview-side)
Make the preview overlay size itself **proportionally to the displayed video**, using the exact same ratios as the burn-in. This makes the preview a true WYSIWYG of the final film.

### Steps (all in `src/modules/generator-ui/pages/DashboardPage.tsx`)
1. Add a ref on the preview `<video>` element (or its wrapping container) and track its rendered pixel height via a `ResizeObserver` (state `previewVideoHeight`). Update on mount, resize, and metadata load.
2. Compute overlay metrics from that height using the burn-in ratios:
   - `fontSize = max(14, previewVideoHeight * 0.032 * scale)` (mirror clamp in `drawOverlay`)
   - `logoHeight = previewVideoHeight * 0.12 * scale`
   - `padX = fontSize * 0.9`, `padY = fontSize * 0.6`, `gap = fontSize * 0.45`, `radius = fontSize * 0.6` (matching `mergeVideos.ts`)
3. Replace the fixed Tailwind sizing in the overlay block (lines ~9047–9054, 9057):
   - Logo: drop `max-h-16`; use inline `style={{ height: logoHeight }}` `w-auto object-contain`.
   - Text lines: drop `text-sm`; use inline `style={{ fontSize, lineHeight }}`.
   - Panel: replace `gap-1 rounded-xl px-5 py-4` fixed values with inline styles derived from `fontSize` (gap, borderRadius, padding).
4. Because the panel now already encodes real proportions, keep the existing `transform: scale(...)` driven by `contactOverlay.scale` so the user size slider still works, but ensure `scale` is **not double-applied** — apply `scale` once (either in the metric math OR the transform, not both). Simplest: keep `scale` only in the CSS `transform` and compute base metrics without `scale`, OR bake `scale` into metrics and remove it from transform. Choose one consistently so preview matches `drawOverlay` (which applies `scale` once to `fontSize`/`logoH`).

### Notes
- No changes to `mergeVideos.ts` are required — the burn-in is the source of truth; we align the preview to it.
- Existing drag positioning (`contactOverlay.offset`) and preset positions stay unchanged.
- Pure presentation change; no business logic, data model, or backend impact.

## Validation
- Typecheck.
- Visually verify in the preview that overlay proportions (font size, logo size relative to the frame) closely match a rendered Final Film for top, bottom, center, and custom-dragged positions, at 100% scale and at a couple of slider values.
