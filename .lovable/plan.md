## Goal

When an uploaded image is opened in the large preview (lightbox), the preview box should match the image's real aspect ratio (9:16 / 16:9 / 1:1) instead of always showing a wide box with big black side margins around a portrait image.

## Current behavior

In `src/modules/generator-ui/pages/DashboardPage.tsx` (~line 9094-9107), the preview modal:
- `DialogContent` has a fixed wide width: `className="max-w-3xl ... p-3"`.
- The `<img>` uses `max-h-[80vh] w-auto object-contain mx-auto`.

Because the dialog width is fixed wide (max-w-3xl) but the image is constrained by height, a portrait image renders narrow inside a wide black box — large empty margins on both sides (exactly what the screenshot shows).

## Change (frontend / presentation only)

In the preview `DialogContent`:
- Replace the fixed `max-w-3xl` with a shrink-to-fit width so the dialog box hugs the image: use `w-fit max-w-[95vw]` (and keep `p-3`, border, background).
- Keep the `<img>` height-driven (`max-h-[80vh] w-auto object-contain`) so the width follows the image's natural ratio. The dialog then sizes to that width — portrait images get a narrow box, landscape gets a wide box, square gets a square box.

Net result: the preview frame always matches the actual image dimensions, with no oversized black side margins.

## Scope

- Single file: `src/modules/generator-ui/pages/DashboardPage.tsx`, only the `previewImageUrl` `Dialog`/`DialogContent` block (~line 9094-9107).
- No backend, schema, state, or business-logic changes.
