# Add labels to Working clips icons

The three circled icons in the "Working clips / Pending" panel header are currently icon-only (only a hover `title` tooltip). The user wants visible text so it's clear what each does.

## The three buttons
1. **Upload image** (ImagePlus icon)
2. **Cover** — Generate film cover with AI (Camera icon)
3. **Upload film** (Upload icon)

## Change (UI only)
In `src/modules/generator-ui/pages/DashboardPage.tsx` (panel header around lines 10676–10732):

- Convert each round icon-only button into a pill with icon + short text label, e.g.:
  - `Image` (upload image)
  - `Cover` (AI film cover)
  - `Film` (upload film)
- Replace `h-8 w-8` circular styling with an auto-width rounded pill (`h-8 px-3 gap-1.5 rounded-full`) containing the icon plus a `text-xs` label.
- Keep all existing `onClick`, refs, `disabled`, loading spinner, and `aria-label`/`title` behavior unchanged.
- Labels in English (per project convention), kept short so all three fit on one row in the narrow side panel.

No changes to logic, generation, auth, storage, or any other component.

## Verify
Run a quick Playwright screenshot of the panel header to confirm the three labeled pills render and fit on one line.
