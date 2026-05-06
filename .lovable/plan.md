## Goal

Currently the video preview stretches tall enough to slide *underneath* the fixed chat composer at the bottom (visible in the screenshot — the bottom of the video is hidden behind the prompt box). Fix: cap the preview's vertical size so it always sits fully above the composer, regardless of aspect ratio (9:16, 1:1, 16:9).

## Root cause

In `src/modules/generator-ui/pages/DashboardPage.tsx`, the preview stage size helpers `ratioToHeight` and `ratioToWidth` (lines 316–332) cap the preview at **`82vh`**. The composer is `position: fixed` at the bottom (line 2311) and occupies roughly the bottom ~13rem of the screen (composer card + its `bottom-[clamp(1rem,4.8vh,3.4rem)]` offset + the helper text "Describe the motion for the frame(s)" rendered below). 82vh leaves only ~18vh for everything else — on common viewports (e.g. the user's 1354px tall window) the video extends well into the composer's footprint, producing the overlap shown in the screenshot.

## Fix

Replace the `82vh` cap with a viewport-relative budget that explicitly subtracts the composer's height:

- New constant: `PREVIEW_MAX_HEIGHT = 'calc(100vh - 17rem)'`
  - ~3rem reserved for the top header strip (Start Over / Final Film / Music tabs)
  - ~14rem reserved for the composer (its bottom offset + padding + textarea + helper line)
- Use this constant in both `ratioToHeight` (height term) and `ratioToWidth` (the height-derived width term), keeping the existing horizontal `calc(100vw - 26rem)` cap untouched.

Result: on any viewport, the preview card scales down so its bottom edge stays above the composer. The horizontal cap and aspect-ratio math are preserved, so 9:16 / 1:1 / 16:9 clips still render at their correct shape and never produce empty bands beside the video.

## Files touched

- **Edited only**: `src/modules/generator-ui/pages/DashboardPage.tsx` — `ratioToCss` / `ratioToHeight` / `ratioToWidth` block (lines 316–332). No other code, no new state, no new components, no new packages.

## Acceptance check

1. Open a 9:16 (REELS) preview at the current viewport — the entire video, including its footer (prompt + status pill), is fully visible above the composer; nothing is hidden behind it.
2. Same for 1:1 and 16:9.
3. Resize the window taller / shorter — the preview always shrinks to leave the composer fully visible; it never overlaps.
4. The right HISTORY sidebar and left rail are unaffected.
