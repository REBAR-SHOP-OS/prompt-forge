## Goal
Group the three top toolbar buttons (Start over, Final film, Music) as a single, visually-centered cluster at the top-center of the page.

## Current problem
Each button is independently `fixed` with `left-1/2` plus hardcoded margin offsets (`ml-[120px]`, `ml-[260px]`, and `-translate-x-1/2`). This makes them look slightly off-center, asymmetric, and fragile (the cluster shifts when the Music button label changes width, and "Start over" sits centered while the other two extend rightward).

## Fix
In `src/modules/generator-ui/pages/DashboardPage.tsx` (around lines 1537–1697):

1. Wrap the three buttons (Start over, Final film, Music) in a single fixed container:
   ```
   <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 sm:top-5">
     {/* Start over button */}
     {/* Final film button */}
     {/* Music button */}
   </div>
   ```
2. Remove the `fixed`, `left-1/2`, `top-4`, `ml-[120px]`, `ml-[260px]`, `-translate-x-1/2`, `sm:top-5`, and `z-50` utility classes from each individual button — they become normal flex children.
3. Preferred visual order left → right: **Start over**, **Final film**, **Music** (matches the screenshot).
4. Keep all other existing behavior, dialogs, handlers, and the Music label truncation untouched.

## Result
The three icons render as one centered, evenly-spaced toolbar at the top of the page, perfectly aligned regardless of label width or viewport size, matching the user's intent in the screenshot.

## Files
- `src/modules/generator-ui/pages/DashboardPage.tsx`
