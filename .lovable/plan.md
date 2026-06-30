## Add aspect-ratio shape icons to the ratio selector

### What
The three aspect-ratio buttons (9:16, 1:1, 16:9) in the bottom prompt bar currently only show text labels. Users need a visual shape cue to quickly understand what each ratio looks like.

### How
In `src/modules/generator-ui/pages/DashboardPage.tsx`, inside the aspect-ratio `radiogroup` (around line 11886), add a small shape icon before the label of each button:

- **9:16** → `RectangleVertical` icon (tall rectangle)
- **1:1** → `Square` icon
- **16:9** → `RectangleHorizontal` icon (wide rectangle)

These three icons already exist in `lucide-react`. They will be imported alongside the other icons at the top of the file. Each icon will render at `h-3 w-3` (or equivalent scaled size) inline with the label text, inside the existing button markup.
          existing label/hint text, active/locked states, and lock icon remain untouched.

No backend changes, no auth changes, no new dependencies.
