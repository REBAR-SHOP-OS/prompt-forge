# Add more graphic themes to the theme picker

## Goal
Extend the "Pick a theme" menu in the "Generate image with AI" dialog with additional professional graphic themes, each with an English label, a descriptor for prompt generation, and a high-quality preview image — matching the existing pattern exactly.

## New themes to add (8)
| ID | Label | Descriptor focus |
|----|-------|------------------|
| `industrial-grunge` | Industrial Grunge | raw concrete, steel, exposed pipes, gritty workshop, hard directional light |
| `golden-hour` | Golden Hour | warm sunset glow, long soft shadows, backlit rim light, cinematic warmth |
| `studio-gradient` | Studio Gradient | smooth colored gradient backdrop, soft spotlight, modern commercial pop |
| `nature-fresh` | Nature Fresh | lush greenery, water droplets, dewy daylight, clean organic freshness |
| `tech-futuristic` | Tech / Futuristic | sleek holographic UI accents, dark glass, blue glow, high-tech product feel |
| `bold-typographic` | Bold Typographic | strong geometric color blocks, Swiss/Bauhaus layout, poster ad energy |
| `warm-minimal` | Warm Minimal | beige/sand tones, soft natural shadows, cozy minimalist studio |
| `dramatic-spotlight` | Dramatic Spotlight | single hard spotlight, deep black background, theatrical product reveal |

(Final list can be trimmed/tuned; all English labels per project convention.)

## Implementation
1. Generate one preview JPG per new theme into `src/assets/theme-previews/` (consistent product-on-backdrop style, matching existing previews).
2. In `src/modules/generator-ui/components/AiImageDialog.tsx`:
   - Add the new image imports alongside the existing theme imports (lines ~20-33).
   - Append the new entries to the `THEME_OPTIONS` array (after line 51), following the exact existing object shape (`id`, `faLabel`, `enLabel`, `descriptor`, `image`).
3. No other logic changes — the picker, prompt-descriptor injection, and `write-image-prompt` flow already consume `THEME_OPTIONS` generically.

## Verification
- `bun run tsc --noEmit` clean.
- Open the dialog → "Pick a theme" shows the new themes with previews and they scroll/select correctly.

## Notes / question
This only touches the theme list + assets (presentation). If you have specific themes in mind (e.g. construction/urban industrial focus for your domain), tell me and I'll use exactly those instead of the suggested set.