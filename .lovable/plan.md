## Goal
Replace the spinner + linear progress bar in the rendering preview with a circular **Progress Indicator** that displays the percentage in its center.

## Change
In `src/modules/generator-ui/pages/DashboardPage.tsx` (lines ~1736–1763), inside the rendering placeholder:

- Remove the `LoaderCircle` spinner, the large "18%" text, and the thin horizontal bar.
- Replace them with a circular SVG progress ring:
  - 128×128 container, two concentric circles (track + progress).
  - Track: `text-white/10`, stroke-width 8.
  - Progress arc: `text-amber-300`, stroke-width 8, rounded caps, `strokeDasharray` driven by `pct`, rotated -90° so it starts at 12 o'clock.
  - Centered overlay shows `{pct}%` in large tabular-nums.
  - Proper `role="progressbar"` + `aria-valuenow/min/max`.
- Keep the status label and the "About N% remaining" / long-render message below it unchanged.

## Result
Rendering screen shows a clean circular progress ring with the live percentage in the middle, replacing the previous spinner + thin bar layout.

## Files
- `src/modules/generator-ui/pages/DashboardPage.tsx`
