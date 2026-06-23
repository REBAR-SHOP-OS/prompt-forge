## Goal

Inside the **Voiceover** dialog, next to the TEXT box (the spot circled in yellow), add an icon button that lets the user pick one of their **uploaded products** by name, enter a **duration in seconds**, and auto‑generate an **English advertising narration** that replaces the TEXT field content.

## How it works (user flow)

```text
Voiceover dialog
 ┌─────────────────────────────┐
 │ TEXT  [textarea]            │
 │ [🛍 product icon]   0/5000  │  ← new icon under the textarea
 └─────────────────────────────┘
        │ click
        ▼
 Small popover:
   • Product list (by name)  → select one
   • Duration (seconds) input
   • "Generate narration" button
        │
        ▼
 English ad narration text is written INTO the TEXT field (replaces existing text)
```

1. A new small icon button (shopping‑bag/sparkle, `lucide-react`) appears under the TEXT textarea.
2. Clicking it opens a Popover listing the user's uploaded **product** images by their display name (the same products already loaded as `archiveProductImages`, category `product`). Each row is selectable.
3. The popover has a **duration (seconds)** number input (free custom value) and a **Generate narration** button.
4. On generate, the app calls a backend AI function that returns a concise **English** advertising narration sized to the chosen seconds, and the result **replaces** the current TEXT field value. The user can then generate the voiceover as usual.

## Implementation

### 1. Backend — new edge function `ad-narration`
- `supabase/functions/ad-narration/index.ts`: CORS + in‑code JWT validation + Zod body `{ productName: string, durationSec: number(1–600) }`.
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with `LOVABLE_API_KEY` to write a single, natural **English** advertising voiceover script for the product, paced to the given seconds (word budget ≈ `durationSec × ~2.3` words). Returns `{ narration: string }` — spoken words only, no scene/visual directions, no labels.
- Reason for a dedicated function: `scenario-write` returns a full visual scenario mixed with narration; here we need clean spoken text only.

### 2. Frontend — `VoiceoverDialog.tsx`
- Add props: `products?: { id: string; name: string }[]`.
- Add state for popover open, selected product id, duration‑seconds string, and a generating flag.
- Under the TEXT textarea, render the icon button + a `Popover` (already in the UI kit) containing:
  - product list (radio‑style selectable rows; empty state "No saved products yet"),
  - a seconds number input,
  - a "Generate narration" button (disabled until a product is selected and seconds > 0).
- On generate: `supabase.functions.invoke('ad-narration', { body: { productName, durationSec } })`, then `setText(result.narration)` (replace), close the popover, toast on success/error. Errors (402/429/etc.) surfaced via `toast`.

### 3. Wire data in `DashboardPage.tsx`
- Pass `products={archiveProductImages.map(p => ({ id: p.id, name: <display name> }))}` into `<VoiceoverDialog>`. The display name reuses the existing product‑name logic (`title` when present, otherwise the cleaned/derived name already used in the products archive).

## Notes / constraints
- Narration language: **English** (per your choice).
- Duration: **custom seconds** typed by the user (per your choice).
- Behavior: generated text **replaces** the TEXT field (per your choice).
- No database/schema changes. No changes to existing voiceover generation, music, or product‑ad flows — purely additive.
