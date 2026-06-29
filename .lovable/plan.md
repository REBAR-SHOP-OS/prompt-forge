## Goal
In the AI image theme picker (`AiImageDialog.tsx`), make all text English and give each of the 30 themes a large, visible preview so the user can see what each theme looks like at a glance. This is a UI/presentation-only change.

## Changes (all in `src/modules/generator-ui/components/AiImageDialog.tsx`)

### 1. English-only text
- Trigger button: replace `انتخاب تم` / `selectedTheme?.faLabel` with English `Pick a theme` / `enLabel`.
- Popover header: `انتخاب تم تصویر` → `Choose a theme`.
- Clear button: `حذف انتخاب` → `Clear`.
- Each theme row: show only the English `enLabel` (drop the Persian `faLabel` line).
- Remove `dir="rtl"` from the popover so layout is left-to-right.
- Keep the `faLabel` field in the data for now (harmless), but it is no longer rendered.

### 2. Large visual previews per theme
- Add a `swatch` style to each `THEME_OPTIONS` entry — a CSS background (gradient / pattern) that visually represents the theme (e.g. Neon = dark bg with bright magenta/cyan glow, Pastel = soft pastel gradient, Black & White = grayscale, Watercolor = soft blended washes, Duotone = two-color split, Metallic = chrome-like gradient, etc.). Pure CSS so no image assets are added and it stays fast/deterministic.
- Change the popover from a narrow vertical list to a **2-column grid of large preview cards**. Each card shows:
  - A tall swatch thumbnail (the visual preview, the "درشت/large" part).
  - The English theme name beneath it.
  - A check overlay when selected.
- Widen the `PopoverContent` (e.g. `w-[22rem]`) and keep it vertically scrollable (`max-h`) so all 30 cards are reachable.

### Technical notes
- No backend, generation logic, or prompt-descriptor changes — `descriptor` text passed to generation stays exactly the same.
- Selection state (`selectedTheme`), reset-on-close behavior, and `handleGenerate` logic are unchanged.
- Previews are CSS-driven (inline `style={{ background: ... }}` or Tailwind classes), so they render instantly with zero added assets.

## Result
The theme menu becomes an English, grid-based gallery of large visual swatches, letting the user preview each theme's look before applying it.