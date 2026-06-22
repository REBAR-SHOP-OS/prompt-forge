# Character Sheet feature

Add a new **Character Sheet** action next to the **Product Ad** button. It opens a full scenario generator (camera style, genre, scene, duration — same UX as Product Ad), but it is centered on an uploaded **character**. The user must upload a character image; the AI analyzes it to understand who the character is and writes a cinematic scenario built around that character. The uploaded image is used as a **descriptive reference only** — it is NOT placed as the clip's start frame.

## What the user sees
- A new pill button "Character Sheet" in the composer, beside "Product Ad", with its own icon.
- Clicking it opens a dialog that mirrors the Product Ad flow:
  - Required **character photo upload** (always uploaded by the user — no "choose from products" option).
  - Character name + optional description (personality, role, vibe).
  - Optional own-prompt, duration, camera style, genre & atmosphere, scene & environment (reused from the existing scenario controls).
  - "Generate scenario" → produces the scenario, then "Use as prompt" / "Send scenes".
- Multi-language labels matching the existing dialog (en/fa/ar/tr/es/fr).

## How it behaves
- The character image is sent to the AI only for analysis. The generated scenario keeps the character visually and behaviorally consistent across every shot and makes them the protagonist of the film.
- When the scenario is applied, only the **prompt text** is sent to the composer. The image is **not** set as the Start frame (descriptive reference only, per the chosen behavior).

## Technical changes

### 1. Edge function `supabase/functions/scenario-write/index.ts`
- Add a new mode `character-sheet` alongside `product-ad`.
- Add a `CharacterSheetOpts` type (`characterName`, `characterDescription`, `cameraStyle`, `cameraMovement`, `genre`, `scene`).
- Add a system-prompt branch: "world-class film director… The attached image is the lead CHARACTER. Analyze appearance, wardrobe, age, expression, vibe; keep this character consistent and recognizable in every shot; build the whole film around this character." Reuse the existing camera/genre/scene guidance.
- Reuse the existing image-analysis path (`image_url` content block) and the existing scene-count / word-cap / parsing logic unchanged.
- Validation: require the image for this mode (return 400 if missing for `character-sheet`).

### 2. New component `src/modules/generator-ui/components/CharacterSheetDialog.tsx`
- Cloned from `ProductAdDialog.tsx`, adapted:
  - Photo upload is **mandatory**; remove the "choose from products" picker.
  - Character-oriented labels/placeholders in all 6 languages.
  - Calls `supabase.functions.invoke('scenario-write', { body: { mode: 'character-sheet', characterName, characterDescription, cameraStyle, genre, scene, idea, durationSeconds, imageUrl } })`.
  - `onUseAsPrompt(scenario)` / `onSendScenes(scenes)` are called **without** an image URL, so the dashboard sets only the prompt.

### 3. `src/modules/generator-ui/pages/DashboardPage.tsx`
- Add `isCharacterSheetOpen` state.
- Add the "Character Sheet" button next to the Product Ad button (lucide icon such as `UserSquare`/`Drama`).
- Render `<CharacterSheetDialog>` wired so `onUseAsPrompt`/`onSendScenes` set `promptText` only (no `handleUseImageAsStart` call).

## Out of scope
- No DB/schema changes; no new storage buckets (upload reuses the existing image upload path used by Product Ad).
- Start-frame behavior is intentionally left untouched.
