# Make the central preview area much larger

The video preview in the middle of the dashboard currently caps at `w-[min(50rem,...)]` (~800px) and `max-h-[52vh]`, which makes it look small on wide screens. Enlarge it so it uses most of the available space between the side panels and most of the vertical space above the prompt bar.

## Change

In `src/modules/generator-ui/pages/DashboardPage.tsx` (around lines 1548–1550), replace the preview container sizing:

- Width: `w-[min(50rem,calc(100vw-2rem))]` → `w-[min(96rem,calc(100vw-26rem))]`
  - Reserves ~26rem for the right History panel (open) and breathing room; on narrow screens the `min()` keeps it from overflowing.
- Max height of the video frame: `max-h-[52vh]` → `max-h-[82vh]`
- Vertical offset reduced from `-translate-y-10 / sm:-translate-y-8` to `-translate-y-6 / sm:-translate-y-4` so the bigger frame stays centered and doesn't collide with the top toolbar.

The `aspect-video` ratio is preserved, so the frame scales proportionally and still leaves room for the prompt bar at the bottom.

## Files touched
- `src/modules/generator-ui/pages/DashboardPage.tsx` (sizing tweak in the preview block)
