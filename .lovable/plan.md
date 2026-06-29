## Goal
Tidy the four action icons in the "Generate image with AI" dialog so they no longer overlap each other or the helper text.

## Problem
In `src/modules/generator-ui/components/AiImageDialog.tsx`, the buttons **Upload image**, **Pick a theme**, **Select product**, and **Write prompt** are all absolutely positioned over the textarea with fixed offsets (`left-3`, `left-[8.5rem]`, `left-[15rem]`, `right-3`). Hardcoded offsets break when labels change (e.g. theme name) and the row collides with the "Add up to 4 reference images…" text.

## Fix (UI only)
- Remove the absolute positioning from the four buttons and the extra `pb-14` padding on the `Textarea`.
- Wrap the four buttons in a single `flex flex-wrap items-center gap-2` container placed directly **below** the textarea, so they flow naturally and wrap on narrow widths instead of overlapping.
- Keep each button's existing styling, icons, Popover wrappers, handlers, and disabled logic intact — only the layout container/positioning changes.
- Keep the helper text / reference-image list below the button row with proper spacing so nothing overlaps.

## Scope
Only `AiImageDialog.tsx` presentation markup. No logic, state, edge function, or data changes.
