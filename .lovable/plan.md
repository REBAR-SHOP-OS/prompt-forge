## Goal
Add a new "Product Photos" (عکس محصولات) tab/icon inside the Storage panel where the user can upload product images, which are then saved and listed in that section — separate from the auto-generated Images.

## Approach
Product photos are stored in the same image table and bucket as existing images, but tagged with a `category` so they show only in the new tab.

### 1. Database (migration)
- Add column to `public.generator_user_images`:
  - `category text not null default 'general'`
- Existing rows stay `'general'`; uploaded product photos will be `'product'`.
- (RLS/grants already exist on this table — no changes needed.)

### 2. Storage modal — new tab (`DashboardPage.tsx`)
- Extend `archiveTab` union: `'films' | 'images' | 'audio' | 'products'`.
- Add a fourth tab button next to "Audio" (the circled empty spot) labeled **Product Photos**, using a `Package`/`ShoppingBag` lucide icon, with a live count badge.
- Update the header count + description switch statements to handle `'products'`.

### 3. Data loading
- In `loadArchive`, select `category` from `generator_user_images`.
- Split results into:
  - `archiveImages` → rows where category = `'general'`
  - `archiveProductImages` → rows where category = `'product'`
- Add `archiveProductImages` state.

### 4. Upload in the Product Photos tab
- Add an "Upload product photo" button (with hidden file input) shown at the top of the products tab.
- Reuse the existing upload flow (`USER_IMAGES_BUCKET` upload → `getPublicUrl` → insert row), but insert with `category: 'product'`, then prepend to `archiveProductImages`.
- Same validation as current image upload (image type, max 10 MB).

### 5. Rendering, download, delete
- Render the products grid by reusing the existing Images-tab card markup (thumbnail, date, download, delete), driven by `archiveProductImages`.
- Wire select-all / bulk-delete and single delete to include product image ids (delete uses existing `handleDeleteUserImage`, which works by id regardless of category).
- Empty state: icon + "No product photos yet — upload a product image to store it here."

## Technical notes
- Files touched: `src/modules/generator-ui/pages/DashboardPage.tsx` + one SQL migration.
- No backend/edge-function changes; uses existing client-side Supabase upload + insert pattern already used for images.
