# History of reframed product images

## Goal
In the "Choose from products" dialog, add a top-right icon that opens a gallery of product images that were **already reframed** in this dialog. Each thumbnail shows its **aspect ratio** (9:16 / 1:1 / 16:9). Picking one reuses it instantly — no new generation, no extra cost.

Today, when a user picks a product + aspect ratio, `image-reframe` generates a new image into the private `wan-frames` bucket but nothing is recorded, so the same reframe gets paid for and regenerated every time. This change records each reframe and lets users pick from past results.

## How it works

```text
Choose from products  [⌖ history icon] [×]
 ─ pick aspect (9:16 / 1:1 / 16:9)
 ─ pick a product  → image-reframe → save record → preview

[history icon] → gallery of past reframes
   ┌──────┐ ┌──────┐ ┌──────┐
   │ img  │ │ img  │ │ img  │   each card overlays a badge: "9:16"
   │ 9:16 │ │ 1:1  │ │ 16:9 │   click → reuse immediately
   └──────┘ └──────┘ └──────┘
```

## Changes

### 1. Persist each reframe (data)
Reframed outputs already land in the private `wan-frames` bucket. Record a row so they can be listed later, reusing the existing `generator_user_images` table:
- `category = 'reframe'`
- `storage_path` = the reframe's `wan-frames` path returned by the function
- `title` = source product name (cleaned)
- `width` / `height` = canonical dims for the chosen ratio (e.g. 9:16 → 1080×1920, 1:1 → 1024×1024, 16:9 → 1920×1080) so the ratio can be derived/displayed
- `user_id` = current user

This insert happens client-side in `pickProduct` right after a successful reframe (mirrors how AI images are saved in `AiImageDialog.handleUse`). No edge-function or schema change is needed — the columns already exist and RLS already scopes `generator_user_images` to the owner.

### 2. History icon + gallery (UI) — `ProductAdDialog.tsx`
- Add a small icon button (lucide `History` or `Images`) in the product-picker `DialogHeader`, top-right next to the close affordance, RTL-aware.
- Clicking it loads `generator_user_images` where `category = 'reframe'` for the user (newest first), signing each `wan-frames` path with the existing `signFramesUrl` helper.
- Render a grid of cards. Each card overlays an **aspect-ratio badge** computed from `width:height` (snap to nearest of 9:16 / 1:1 / 16:9), shown in a corner pill.
- Clicking a card sets it as the active preview/image directly (same state updates as the end of `pickProduct`, minus the network call) and closes the picker — so no regeneration happens.
- Add localized strings (en/fa/ar/tr/es/fr) for the new labels: history title, empty state ("No reframed images yet"), and reuse hint. Persian first-class since the UI is RTL there.
- Empty/loading states match the existing product grid styling.

### 3. Reuse-aware behavior (optional safety)
When the user picks a product + aspect that already has a saved reframe, surface/prefer the cached one. Minimal version: rely on the new history gallery for reuse. (If desired, we can later auto-detect an existing reframe for the exact product+aspect and skip the call — noting it here but keeping the first pass scoped to the gallery.)

## Notes
- No backend/schema migration required; `generator_user_images` already has `category`, `width`, `height`, `title`.
- Only frontend + a client-side insert; generation pipeline and validators are untouched.
- Aspect ratio is shown as the label (per your choice), not pixel size.
