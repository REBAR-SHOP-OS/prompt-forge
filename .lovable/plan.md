# Professional theme set + real preview images

## Goal
The "Pick a theme" menu in `AiImageDialog.tsx` currently shows ~30 themes as flat CSS gradient swatches — it looks simplistic. Replace it with a **curated, professional, ad-focused theme set**, each represented by a **real generated sample image** thumbnail, and polish the picker layout.

## Scope
Frontend/presentation only. No backend, auth, storage, or generation-pipeline changes. The existing data flow (selected theme → `descriptor` + `enLabel` sent to `write-image-prompt` and appended to the final prompt) stays exactly the same. Only the theme list, the preview rendering, and the picker styling change.

## 1. Curate the theme list
Trim the ~30 themes down to a focused professional set (~14) suited to product/ad creative, removing the gimmicky ones (Doodle, Checkerboard, Scrapbook, Bullet Journal, Puzzle/Grid, Collage, Comic Book). Keep and refine the strong, commercially useful directions, e.g.:

- Minimalist Studio
- Dark & Moody
- Cinematic
- Editorial / Magazine
- Luxury / Premium
- Corporate Clean
- Vibrant Pop
- Vintage / Retro
- Neon / Cyberpunk
- Earthy / Organic
- Monochrome (B&W)
- Metallic / Chrome
- Glassmorphism
- Pastel Soft

Each keeps its `id`, `faLabel`, `enLabel`, and a refined English `descriptor`. The `swatch` field is replaced/supplemented by an `image` field.

## 2. Generate one professional preview image per theme
Use the image generation tool to create a polished, representative sample for each theme (a consistent neutral subject — e.g. a product on a surface — rendered in that theme's exact look so the previews read as a coherent, professional set). Each image is generated at a small preview-friendly size (e.g. 512x640 to match the tall 9:16-ish card), saved to `src/assets/theme-previews/`, and externalized as a Lovable CDN `.asset.json` pointer (no binaries committed). Each `ThemeOption` imports its pointer's `url`.

## 3. Update the picker UI (`AiImageDialog.tsx`)
- Change `ThemeOption` type: replace `swatch: string` with `image: string` (the asset URL).
- Render each preview tile as an `<img>` of the real sample (object-cover) instead of a CSS-gradient `<span>`, keeping the selected-state ring, the check badge, and the label.
- Slightly enlarge tiles and improve spacing/typography so the menu feels premium (taller thumbnails, subtle gradient label overlay, rounded corners, hover lift). Keep the 2-column scrollable grid.
- Keep all labels in English (per earlier preference).

## 4. Verify
- `tsgo` clean.
- Open the dialog in the preview (Playwright) and screenshot the theme menu to confirm the real images render and the layout looks professional.

## Technical notes
- `selectedTheme`, `handleWritePrompt`, and final-prompt assembly are untouched — they already read `descriptor`/`enLabel`, which remain.
- Preview images are review/UI assets only; they are not sent to the generation backend.
- Asset pointers created via `lovable-assets create` → `src/assets/theme-previews/<id>.jpg.asset.json`.
