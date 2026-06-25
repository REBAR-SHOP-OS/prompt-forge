## Goal

In the **Storage → Product Photos** tab, let the user add a free-text **description** for each product image (e.g. "rebar stirrup, rectangular, 8mm steel, hook on one corner"). This description is stored with the image and fed to the AI when that product is used, so the model understands exactly what the product is and doesn't distort it during video generation.

Today each product photo has only an optional **name**. We add a richer **description** field alongside it.

## What the user will see

- Under each product photo (next to the name), a new **"Describe for AI"** field (a small multi-line text box) where they can type what the product is and any rules ("keep the hook visible", "do not change the spacing", etc.).
- The description is saved automatically and persists. A short hint explains it helps the AI build the video correctly.
- Optionally: an **"Auto-describe"** button that asks the AI (vision) to generate a draft description from the image, which the user can then edit. (Confirm if wanted — see question.)

## How it improves generation

When a product is selected/pinned for a project, its description is injected into:
1. The **PRODUCT IDENTITY LOCK** prompt block (`applyProductPrefix`) sent with every clip.
2. The **bake-into-start-frame** instruction (`bakeProductIntoFrame`) used to composite the real product into each frame.

This gives the model an explicit textual understanding of the product in addition to the reference image.

## Technical details

**1. Database (`generator_user_images`)**
- Add migration: `ALTER TABLE public.generator_user_images ADD COLUMN IF NOT EXISTS description text;`
- No new grants/policies needed (column on existing table; existing RLS covers it).

**2. Type + queries (`DashboardPage.tsx`)**
- Add `description?: string | null` to `UserImageItem` and to `ProjectProduct`.
- Include `description` in the select column lists used when loading images and on insert (lines ~4839, ~4712, and the archive/product load query).

**3. Upload + edit**
- On upload insert, persist `description` (empty by default).
- Add `updateProductDescription(imageId, text)` mirroring `renameProductPhoto`, updating `generator_user_images.description` and local `archiveProductImages` state. Debounce/save on blur or Enter.

**4. UI (Product Photos card, ~lines 8060–8160)**
- Add a `<textarea>` "Describe for AI" under the name, bound to per-image state, saved on blur.
- Add a one-line helper text under the section header.

**5. Feed into AI**
- Extend `applyProductPrefix` to append the product description when present.
- Extend `bakeProductIntoFrame` instruction to include the description.
- Ensure `selectedProduct`/pinned product carries `description` through to both paths.

**6. Verify**
- `bunx tsgo --noEmit` clean; quick Playwright check that the field renders, saves, and reloads.

## Out of scope
- No changes to generation UI layout beyond the new field, auth, storage policies, or providers.
