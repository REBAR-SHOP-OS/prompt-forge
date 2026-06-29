## Goal
In the **Generate image with AI** dialog, add an icon button (in the prompt toolbar, in the empty spot circled in yellow — right of the theme picker) that lets the user pick from their **saved product photos** and attach the chosen one as a reference image for generation. This mirrors how products already feed into video generation, but makes them reachable while building a cover/image.

## What exists today
- `AiImageDialog.tsx` already supports up to `MAX_REFERENCE_IMAGES` (4) reference images, an "Upload image" button, and a "Pick a theme" popover in the prompt toolbar.
- `DashboardPage.tsx` already holds the user's product photos in `archiveProductImages` (UserImageItem[] with signed `storage_path`, `description`), and renders `<AiImageDialog />`.

## Plan

### 1. Pass products into the dialog (`DashboardPage.tsx`)
- Add a new prop to the `<AiImageDialog />` render: `products={archiveProductImages.map(p => ({ id: p.id, url: p.storage_path, title: <name/derived label>, description: p.description ?? null }))}`.
- No business-logic/storage changes — purely passing already-loaded, signed product URLs down.

### 2. Add the "Select product" control (`AiImageDialog.tsx`)
- Extend `Props` with optional `products?: { id: string; url: string; title: string | null; description?: string | null }[]`.
- Add a new toolbar button next to the theme picker (positioned in the empty area circled in the screenshot), using a product icon (e.g. `ShoppingBag`/`Package` from lucide), label **"Select product"**.
- Clicking opens a `Popover` showing a scrollable grid of the user's product photos (thumbnail + title). If there are no products, show a short empty-state hint ("No saved products yet").
- Selecting a product:
  - Fetches its URL → converts to a data URL (reuse existing fetch→blob→dataUrl helpers / `fileToDataUrl` pattern).
  - Adds it to `referenceImages` (respecting the 4-image cap, reusing the same guard/error messaging as upload).
  - Closes the popover. The selected product then appears in the existing reference-images list with remove support — no separate UI needed.
- All labels in English, consistent with the existing theme picker styling.

### 3. Verify
- `bunx tsgo --noEmit` clean.
- Confirm the button renders in the toolbar, the popover lists products, selecting one adds it to the reference list, and the 4-image cap still holds.

## Technical notes
- Reuses existing reference-image state, cap logic, and preview/remove UI — only a new entry point (button + popover) and a new prop are added.
- Product URLs are already signed in `archiveProductImages`; fetch-to-dataUrl keeps them consistent with how uploaded references are stored before sending to the edge function.
- No changes to generation UI flow, auth, storage policies, or the credit/job pipeline.
