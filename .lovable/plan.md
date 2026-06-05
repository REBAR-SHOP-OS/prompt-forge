# Add Genre & Narrative Templates to Product Ad

Add a selectable set of genre / narrative atmosphere templates to the Product Ad Scenario dialog, alongside the existing Camera Style chips. When the user picks a genre, the generated scenario is rewritten to inject that genre's directing mood, lighting, and atmosphere.

## Templates
A single-select chip group (selecting again deselects → "no genre"):

- Epic Fantasy
- Sci-Fi Minimalist
- Post-Apocalyptic
- Horror Jump-Scare
- High-Octane Action
- Romantic Dreamscape
- Documentary / Realism
- Anime / Manga Style

Each template maps to a short English directing description (wide dreamlike vistas + magical lighting; clean white minimalist future; ruined overgrown cities; harsh darkness + flashlight + sudden moves; fast cuts + shake + motion blur; golden-hour soft warm light; natural realistic light; bold outlines + saturated 2D + exaggerated motion FX).

## Frontend — `src/modules/generator-ui/components/ProductAdDialog.tsx`
1. Add a `GENRE_TEMPLATES` array of `{ id, label, prompt }` (English directing notes per genre).
2. Add `genre` state (`useState<string>('')`, empty = none).
3. Render a new "Genre & atmosphere (optional)" chip group below Camera Style, styled the same as the camera-style chips. Clicking the active chip clears it.
4. In `generate()`, include `genre` (the selected template's directing description) in the `supabase.functions.invoke('scenario-write', { body: ... })` call.
5. Clear `genre` in `reset()`.

## Backend — `supabase/functions/scenario-write/index.ts`
1. Extend `ProductAdOpts` with `genre?: string`.
2. Read/clip `genre` from the request body (max ~300 chars) into `productAd`.
3. In `cameraGuidance` (or a new `genreGuidance`) add a line when genre is present: instruct the model to direct the whole scenario in that genre's mood, lighting, color, and atmosphere while keeping it a product ad.

Backend changes are backward compatible — `genre` is optional and ignored when absent.

## Result
The user opens Product Ad Scenario, optionally picks a genre template plus camera style and duration, clicks Generate, and gets a scenario rewritten in that genre's cinematic style.
