# Product Ad Scenario Generator

Add a new icon button next to the existing Scenario Writer (Clapperboard) icon in the prompt toolbar. Clicking it opens a guided dialog where the user attaches a product photo, enters the product name, answers a few questions, and gets an AI-generated advertising scenario that respects the chosen camera style and movement.

## User flow

```text
[🎬 Product Ad icon]  ->  Dialog opens
   Step 1 — Product
     • Attach product photo (upload)
     • Product name (text)
     • Short product description (optional)
   Step 2 — Questions
     • Duration: 5 / 10 / 15 / 30 / 45 / 135 s
     • Camera style (pick one):
         Whip Pan, Orbit Shot, FPV Drone, Tracking Shot,
         Push In Cinematic, Fly Through, Crash Zoom,
         Handheld Dynamic, Dolly Zoom, Parallax Motion
     • Camera movement notes (free text, optional)
   ->  "Generate ad scenario"
   ->  Scenario shown (single or 3 scenes for 45s, like today)
   ->  "Use as prompt"  (fills main prompt + attaches the product image)
       / "Send all to Pending" for 45s split
```

## What gets built

### 1. New dialog component
`src/modules/generator-ui/components/ProductAdDialog.tsx`
- Modeled on the existing `ScenarioWriterDialog` (reuse its image-upload to the `wan-frames` bucket, duration selector, scene rendering, copy / regenerate / use-as-prompt actions).
- Adds: product name input, optional description, a camera-style selector (10 options as pill buttons), and a camera-movement notes textarea.
- Reuses the same `onUseAsPrompt` and `onSendScenes` callbacks already wired for the Scenario Writer so the result flows into the prompt box / Pending exactly like today.

### 2. Toolbar icon
In `DashboardPage.tsx`, add a button right after the Scenario Writer icon (around line 6967) using a product-style Lucide icon (e.g. `Package` or `ShoppingBag`), with its own `isProductAdOpen` state, and render `<ProductAdDialog .../>` near the existing `<ScenarioWriterDialog />` (around line 5558), passing the same handlers.

### 3. Edge function support
Extend the existing `scenario-write` function (`supabase/functions/scenario-write/index.ts`) to accept optional fields: `mode: "product-ad"`, `productName`, `productDescription`, `cameraStyle`, `cameraMovement`. When in product-ad mode, the system prompt is rewritten to produce a persuasive product-commercial scenario that:
- Centers the named product as the hero,
- Bakes the selected camera style (e.g. "Crash Zoom", "Orbit Shot") and any movement notes into the shot descriptions,
- Keeps the existing duration/word-cap and multi-scene (`===SCENE===`) splitting logic unchanged.

All existing scenario-writer behavior stays intact; product-ad is an additive branch.

## Technical notes

- No database/schema changes; reuses the `wan-frames` storage bucket and current auth.
- Camera-style list stored as a constant array in the dialog so it is easy to extend.
- The product image is sent to `scenario-write` as `imageUrl` (already supported) so the AI grounds the scenario in the actual product, and is forwarded to `onUseAsPrompt` to pre-attach it for generation.
