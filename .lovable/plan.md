## Goal

Two improvements to the overlay text editor (Popover):

1. **Many more fonts** — expand the font dropdown from 5 presets to a rich library covering Sans, Serif, Display, Mono, Script/Handwriting, Decorative, and Arabic/Persian.
2. **Show font names in their own typeface** — each `<option>` in the Font dropdown should be rendered using its actual font, so the user can see what it looks like before picking.

## Changes

### 1. `index.html` — load all the new fonts from Google Fonts

Replace the single Google Fonts `<link>` with one that includes all families below. Single combined request, `display=swap`.

### 2. `src/modules/generator-ui/lib/overlays.ts` — expand `OVERLAY_FONT_PRESETS`

Group fonts by category (added as a `category` field used only for the optgroup label):

- **Sans**: Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Raleway, Work Sans, Nunito, Rubik
- **Display**: Oswald, Bebas Neue, Anton, Archivo Black, Righteous, Russo One, Black Ops One, Bangers, Creepster
- **Serif**: Playfair Display, Merriweather, Lora, PT Serif, Cormorant Garamond, EB Garamond
- **Mono**: Roboto Mono, JetBrains Mono, Fira Code, Space Mono
- **Script / Handwriting**: Pacifico, Dancing Script, Caveat, Great Vibes, Sacramento, Lobster, Permanent Marker, Shadows Into Light, Indie Flower
- **Pixel**: Press Start 2P
- **Arabic / Persian (فارسی/عربی)**: Vazirmatn, Noto Naskh Arabic, Amiri, Tajawal

Shape: `{ id: 'Roboto', label: 'Roboto', category: 'Sans' }`.

### 3. `src/modules/generator-ui/components/OverlayEditorPopover.tsx` — preview each font in the dropdown

Replace the flat `<option>` mapping with `<optgroup label={category}>` blocks, and on each `<option>` add `style={{ fontFamily: \`"\${f.id}", sans-serif\` }}` so the option text is rendered in its own font. The trigger `<select>` itself also uses `style={{ fontFamily: selected.font_family }}` so the picked font name is visible in its actual face once selected.

Keep all other popover controls untouched.

### 4. Burn-in compatibility

`paintOverlays` and `ensureFontsLoaded` already use `o.font_family` as a string — no changes needed; they will pick up any new family loaded by the new Google Fonts `<link>`.

## Files touched

- `index.html`
- `src/modules/generator-ui/lib/overlays.ts`
- `src/modules/generator-ui/components/OverlayEditorPopover.tsx`

## Notes

- All fonts ship via one Google Fonts request with `display=swap`, so initial paint is unblocked.
- Native `<select>` in most browsers honors per-`<option>` `font-family`, which gives the desired font preview without a heavy custom dropdown.