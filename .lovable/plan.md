# Contact overlay: add a logo (with on/off) + a Center position

## Goal
In the **Contact overlay** popover (the one circled in the screenshot), add:
1. A **logo image** that can be uploaded, turned **on/off**, and is burned onto the film alongside the contact text.
2. A **Center** placement option, so position is no longer only **Top / Bottom** but **Top / Center / Bottom**.

## Current state
- `ContactOverlay` (DashboardPage.tsx ~1792): `{ website, phone, address, enabled, position: 'top'|'bottom' }`. Text persists in the `generator_business_profiles` table; `enabled`/`position` persist in `localStorage` (`project-contact:${userId}`).
- Overlay is burned in by `mergeVideos.ts` → `MergeOverlayOptions { lines, position: 'top'|'bottom' }`, drawn in `drawOverlay()` (text only, gradient bar at top or bottom).
- Live CSS preview over the player (DashboardPage ~8936) mirrors the text at top/bottom.
- Merge call passes `{ lines, position }` at ~6585.

## What will change

### 1. Backend (logo persistence)
Add one nullable column to `generator_business_profiles`: `contact_logo_url text`. The logo is stored as a **client-resized PNG data URL** (max ~256px) — this keeps it small, persists it with the business profile, and lets the merge canvas draw it with **no CORS taint** (data URLs are same-origin-safe, unlike private-bucket URLs).

### 2. State / type (`DashboardPage.tsx`)
- Extend `ContactOverlay`: add `logoUrl: string`, `logoEnabled: boolean`; change `position` to `'top' | 'center' | 'bottom'`.
- Load `contact_logo_url` from the DB into `logoUrl` (alongside the existing contact-text load); persist `logoEnabled`/`position` in localStorage; save `logoUrl` to the DB when changed.
- `contactActive` becomes true when there is text **or** an enabled logo.

### 3. Contact popover UI (`DashboardPage.tsx` ~10541)
- Add a **Logo** block: an upload button (file input → resize to data URL), a small thumbnail preview, and a **Remove** button.
- Add a **"Show logo on video"** Switch (drives `logoEnabled`).
- Change the position selector from a 2-button (top/bottom) to a **3-button grid: Top / Center / Bottom**.

### 4. Live preview overlay (`DashboardPage.tsx` ~8936)
- Support `center` (vertically centered block, centered text).
- Render the logo `<img>` above the text lines when `logoEnabled && logoUrl`.

### 5. Burned-in overlay (`mergeVideos.ts`)
- `MergeOverlayOptions`: add `logoUrl?: string`; widen `position` to include `'center'`.
- In `mergeVideoUrls`, preload the logo into a module-level `HTMLImageElement` (via existing `loadImage`) before recording, store in `activeLogo`, and clear it on finish (next to `activeOverlay = null`).
- In `drawOverlay()`:
  - `center`: draw a centered translucent rounded panel, with logo (if present) and text lines centered in the frame (no top/bottom gradient bar).
  - `top`/`bottom`: keep current gradient bar; draw the logo above the text lines.
- Update the merge call at ~6585 to also pass `logoUrl` (when `logoEnabled`).

## Scope / safety
- One additive, non-destructive DB migration (single nullable column; existing rows untouched; existing RLS/policies already cover the table).
- Frontend changes confined to the Contact overlay (state, popover, live preview, merge overlay drawing). No change to video generation, models, or unrelated features.
- Logo stays optional; when absent or toggled off, behavior is exactly as today.

## Technical notes
- Migration: `ALTER TABLE public.generator_business_profiles ADD COLUMN IF NOT EXISTS contact_logo_url text;`
- Client resize: draw the uploaded image onto an offscreen canvas capped at 256px longest edge, `toDataURL('image/png')`.
- `drawOverlay` logo sizing: scale logo to ~`ch * 0.12` height, preserve aspect, center-align with the text block.
