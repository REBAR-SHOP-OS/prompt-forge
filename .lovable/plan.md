## Goal

In the **Product Ad Scenario** dialog, add a clickable character icon. Clicking it lets the user say "this ad will feature a character" and choose one of two sources:
1. A character the user previously created with the **Character Sheet** tool.
2. A character image the user uploads directly.

When **Generate ad scenario** is clicked, the scenario is written so the chosen character appears as a real on-screen character, while the product stays the hero.

## UI changes — `ProductAdDialog.tsx`

- Add a new icon button in the left photo column (product mode only, `isCharacter === false`), styled like the existing "Choose from products" / "Generate with AI" buttons. Icon: `UserRound`. Label: **"Add character"**. When a character is attached, the button shows an active (amber) state and a small thumbnail + an X to remove it.
- New state: `characterPickerOpen`, `characterPhotos` (list from the library), `loadingCharacters`, `characterRefDisplayUrl` (signed, for preview), `characterRefSendUrl` (URL passed to backend), `characterName`.
- Add a **character chooser dialog** (mirrors the existing product picker dialog):
  - Lists the user's saved characters: query `generator_user_images` where `category === 'character'`, newest first, signed for display via the existing `signProductPhotoUrl` helper.
  - An **Upload character** tile that reuses an upload flow (upload to `wan-frames`, same pattern as `handlePickImage`) and an empty-state when there are no saved characters.
  - Selecting/uploading a character stores its display + send URLs and closes the chooser.
- Localize the new strings ("Add character", "Choose a character", "Upload character", "No characters yet") across the existing `T` language map (en/fa/ar/tr/es/fr), defaulting to English text per project preference.
- In `generate()` (product-ad branch): when a character is attached, include it in the request and append a line to `idea` such as: *"This advertisement features a recurring on-screen character; keep their look consistent in every shot while the product stays the hero."*
- Reset the new state in `reset()` and when the dialog closes.

## Backend changes — `supabase/functions/scenario-write/index.ts`

- Extend `ProductAdOpts` with `characterImageUrl?` and `characterDescription?`, parsed/validated from the request body (URL validated with the existing `isAllowedImageUrl`, length-capped).
- When a product-ad request includes a character image, add it as a **second `image_url` block** in the gateway user message (first image = product, second = character) and add a sentence to the product system prompt instructing the model to feature that exact character (match the second attached image's face, hair, wardrobe) consistently while keeping the product the hero.
- No schema or storage changes; bucket/signing behavior is unchanged.

## Result

- A character icon appears in the Product Ad dialog.
- Clicking it lets the user pick a previously made character sheet character or upload one.
- The attached character shows as a thumbnail and can be removed.
- Generating the ad produces a scenario written around both the product and the chosen character.

## Technical notes

- Saved characters are read from `generator_user_images` (`category = 'character'`), the same table the Character Sheet writes to; `user-images` is private so URLs are signed with the existing helper.
- Uploaded characters reuse the `wan-frames` upload + `signFramesUrl` flow already used for product photos, so they pass the provider's `…/object/public/wan-frames/…` validator.
- The product image remains the primary `imageUrl`; the character is sent as a separate `characterImageUrl` so both reach the model.
