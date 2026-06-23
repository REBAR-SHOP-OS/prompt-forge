# Contact-Info Overlay on Generated Films

## Goal
Add a toolbar icon in the composer that opens a small editor where the user types their company **address, phone, and website**. That text is then burned onto the Final Film as a clean lower overlay layer, and previewed live over the working video so the user sees placement before rendering.

## UX
- New round icon button in the composer toolbar (next to Product Ad / Character Sheet / Add character / Prompt), labeled **Contact**, using a `Contact`/`Phone` lucide icon. It highlights (filled style) when contact info is set.
- Clicking opens a popover/dialog with three fields: **Website**, **Phone**, **Address** (all optional), plus an "Show on video" toggle and a **Position** choice (bottom / top). A Clear button empties it.
- Values persist per user in `localStorage` (mirroring the existing `project-audio:${userId}` pattern) under `project-contact:${userId}`, so they survive refresh and project switches.

## Live preview
- Render the contact lines as a CSS overlay (semi-transparent dark bar, small clean text) positioned over the preview video stage when "Show on video" is on, so the user sees exactly where it lands.

## Burned into Final Film
- Extend `src/modules/generator-ui/lib/mergeVideos.ts`:
  - Add an optional `overlay` param to `mergeVideoUrls` (e.g. `MergeOverlayOptions { lines: string[]; position: 'top' | 'bottom' }`).
  - In the per-frame canvas paint loop, after drawing each clip/transition frame, draw a translucent rounded bar plus the contact lines with `ctx.fillText`, scaled to the canvas size, with a subtle shadow for legibility. This makes the text part of the recorded stream (works for every clip and transition automatically).
- In `DashboardPage.tsx`, build the overlay lines from the saved contact info (only non-empty fields) and pass them into the existing `mergeVideoUrls(...)` call at the Final Film site (line ~6494), right alongside `audioOpt` and `transitionsForMerge`.

## Scope / notes
- Frontend only: new dialog/state + localStorage persistence + canvas draw. No DB, edge-function, or schema changes.
- Overlay is only applied when "Show on video" is enabled and at least one field is filled.
- Text is rendered as plain canvas text (no logo/image upload in this pass).

## Validation
- Set contact fields, confirm the live preview shows the bar in the chosen position.
- Generate a Final Film and confirm the address/phone/website is visibly burned into the exported video across all clips and transitions.
- Empty/disabled contact info produces a film with no overlay (unchanged behavior).
