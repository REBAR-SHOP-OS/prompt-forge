# Add Product Name to Product Photos

Let users type a product name next to the Upload button, save it with the photo, display it on each card, and rename existing photos inline.

## Database

Add a `title` text column to `public.generator_user_images` (nullable). Existing rows stay `NULL`. RLS/grants already exist — no change needed.

## Upload flow (Product Photos tab)

- Add a text input for the product name in the "Upload a product photo" panel, placed next to the existing **Upload product photo** button.
- On upload, the typed name is trimmed and saved into the new `title` column alongside the image. The field is cleared after a successful upload.
- Validation: optional name, max 100 characters, trimmed. No name is allowed (saved as `NULL`).

## Card display & rename

- Each product photo card shows its `title` under the thumbnail (above the date). Cards with no name show a subtle "Untitled" placeholder.
- Add an inline rename control on each card (edit icon → small input / save) that updates `title` for that photo and refreshes it in the list.

## Technical details

Files: `src/modules/generator-ui/pages/DashboardPage.tsx` (+ one SQL migration; `src/integrations/supabase/types.ts` regenerated after migration).

- Migration: `ALTER TABLE public.generator_user_images ADD COLUMN title text;`
- Extend the `UserImageItem` type with `title?: string | null`.
- Add `title` to the two `.select(...)` lists in `loadArchive` and `handleProductPhotoSelected`.
- Add state: `productName` (input value) and per-card rename state.
- `handleProductPhotoSelected`: include `title: productName.trim() || null` in the insert; clear `productName` on success.
- Add a `renameProductPhoto(id, title)` helper that runs an `update` on `generator_user_images` (RLS scopes to owner) and updates `archiveProductImages` state.
- Render the name + rename UI inside the existing product card markup (around lines 5684–5740).

```text
┌─ Upload a product photo ───────────────────────────────┐
│ JPG/PNG/WEBP up to 10 MB        [ Product name ] [Upload]│
└────────────────────────────────────────────────────────┘
┌────────────┐
│  [image]   │
│ Rebar Ring ✎│
│ Jun 9 …  ⬇ 🗑│
└────────────┘
```
