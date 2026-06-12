## Goal
Add the same hover/tap video preview that already exists in the Product Ad dialog to the composer's **Styles** picker (the "Prompt" panel chips for Camera / Genre / Scene / Template). Hovering (or tapping on mobile) any style chip will show a small looping muted preview clip plus its name — exactly like the Product Ad screen.

## Current state
- `StylePreviewCard` (already built) wraps a chip and shows a `HoverCard` with a looping muted `<video>` + title/description. Works on touch (opens on tap).
- The Product Ad dialog (`ProductAdDialog.tsx`) imports all the `style-previews/*.mp4.asset.json` clips and maps each style to a `preview` URL, then wraps each chip in `StylePreviewCard`.
- The composer Styles picker in `DashboardPage.tsx` renders chips via the local `StyleSection` component using the shared datasets in `promptStyles.ts` (`CAMERA_STYLES`, `GENRE_STYLES`, `SCENE_STYLES`, `TEMPLATE_STYLES`). These chips currently have **no** preview.
- The shared `StyleItem` type has no `preview` field. Each style `id` maps cleanly to an existing preview asset file (e.g. `whip-pan` → `cam-whip-pan.mp4`, `construction-site` → `scene-construction-site.mp4`, `football-team` → `vid-football-team.mp4`).

## Changes

### 1. `src/modules/generator-ui/lib/promptStyles.ts`
- Add an optional `preview?: string` field to the `StyleItem` type.
- Import the existing `@/assets/style-previews/*.mp4.asset.json` pointers (the same ones already used by `ProductAdDialog`) and attach the matching clip `.url` to each entry in `CAMERA_STYLES`, `GENRE_STYLES`, `SCENE_STYLES`, and `TEMPLATE_STYLES`.
- No logic changes — `preview` is metadata only; prompt-building functions stay untouched.

This makes the previews reusable from one shared source (no duplicated mapping), so both the composer and any future caller use the same clips.

### 2. `src/modules/generator-ui/pages/DashboardPage.tsx` (`StyleSection`)
- Wrap each chip `<button>` in `StylePreviewCard`, passing `title={item.label}`, `description={…}` (short text — can reuse the chip label, or omit), and `preview={item.preview}`.
- Set `rtl` appropriately so alignment matches the rest of the composer.
- Keep all existing chip styling, selection state, and `onToggle` behavior identical. The `StylePreviewCard` trigger uses `asChild`, so the button keeps working as before; chips without a `preview` simply show a text-only card (graceful fallback).

## Out of scope / safety
- No backend, schema, or prompt-generation changes.
- No change to Product Ad dialog (it keeps its own working setup).
- Purely presentational; selection/optimize flow is unchanged.

## Verification
- Open the composer → Prompt → Styles, hover a Camera/Genre/Scene/Template chip → looping muted preview appears, matching the Product Ad behavior.
- On mobile width, tapping a chip shows the preview; selection still toggles.
- Chips with no matching clip still render and toggle without errors.
