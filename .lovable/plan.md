## Goal

Two changes to the image cards (uploaded-image clips in the Pending panel, and product-image cards in the Archive):

1. Display each image card in its **real aspect ratio** (9:16, 16:9, or 1:1) instead of being forced into a square.
2. Add a small **icon button** on each image card that, when clicked, sends that image into the composer's **Start** frame slot (image-to-video), exactly like the existing reframe → Start flow.

## Background (current behavior)

- The uploaded-image clip card (`DashboardPage.tsx`, ~line 7782-7798) hardcodes `style={{ aspectRatio: '1 / 1' }}` with `object-cover`, so portrait/landscape images get cropped into a square. Video cards right below already use `ratioToCss(getRatioFor(video))` correctly.
- An existing handler `handleReframeAsStart(url, ratio)` (~line 3909) stages a URL as the `Start` upload, switches to image-to-video, and sets the aspect ratio. This is exactly the action the new icon needs.

## Changes

### 1. Real aspect ratio for image cards

In the uploaded-image clip card image wrapper (~line 7782-7785):
- Replace `style={{ aspectRatio: '1 / 1' }}` with the project ratio: `style={{ aspectRatio: ratioToCss(lockedProjectRatio ?? aspectRatio) }}`.
- Change the `<img>` class from `object-cover` to `object-contain` so the full frame shows in its true ratio without cropping (background stays `#15171a`).

(Image clips carry the project's locked ratio; there is no separate per-image ratio field, so the project ratio is the correct source — the same one used for the cover card just above.)

### 2. "Use as Start frame" icon on image cards

- Add a small reusable handler `handleUseImageAsStart(url: string)` that mirrors `handleReframeAsStart` but keeps the current locked/aspect ratio: set generation mode to `image-to-video`, push a ready `Start` upload entry with the given `url`, and (best-effort) scroll the composer Start input into view so the user sees it land.
- Add an icon button (lucide `ImagePlus` or `MoveRight`/`SquarePlus`) to the image clip card action row (~line 7803-7826), next to the drag/delete controls, with `title`/`aria-label` "Use as Start frame". On click: `event.stopPropagation()` then `handleUseImageAsStart(img.storage_path)`. Hidden when `isReadOnlyProject` (same as delete).
- Apply the same icon button to the Archive product-image cards (~line 6291-6337 action row) so those image cards can also be sent to Start.

## Technical notes

- Reuse `ratioToCss`, `lockedProjectRatio`, `aspectRatio`, and the `uploadedFiles`/`setUploadedFiles` + `setGenerationMode` patterns already in the file — no new state or backend work.
- No edge function, schema, or business-logic changes; this is frontend/presentation only.
- Scope: `src/modules/generator-ui/pages/DashboardPage.tsx` only.
