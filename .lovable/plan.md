## Goal

In the **Library** panel (right-side "Your library" sheet), make the saved-video cards display as **small squares** instead of the full vertical/horizontal aspect of the source clip. Today a 9:16 Reel render makes the card extremely tall and dominates the panel — the user wants compact square tiles so multiple saved videos can be scanned at a glance.

## Fix

Edit only `src/modules/generator-ui/pages/DashboardPage.tsx`, the Library card thumbnail wrapper around line 2217–2235:

1. Replace the dynamic `style={{ aspectRatio: ratioToCss(getRatioFor(video)) }}` with a fixed square: `aspectRatio: '1 / 1'` (via Tailwind `aspect-square`).
2. Reduce the thumbnail width so it reads as a small tile, not a panel-wide card. Use a fixed compact size like `h-28 w-28` (≈112×112 px) centered or left-aligned, instead of the current full-width `w-full`.
3. Switch the `<video>` from `object-contain` to `object-cover` so the square crop is filled edge-to-edge with the first frame (no letterboxing inside the small tile).
4. Adjust the surrounding card layout to a horizontal `flex` row: square thumbnail on the left, title + date + actions stacked on the right. This is the natural fit for square tiles and matches the mental model the user is asking for.
5. Keep the click-to-preview behavior, the Saved badge, the date (`formatCreatedAt`), download/delete buttons — only the visual layout changes.

No other file is touched. The History panel cards stay as they are (the user only flagged the Library).

## Acceptance check

Open the Library: each saved video appears as a small square thumbnail showing the first frame of the video, with the title, "Saved" badge, creation date and download/delete actions laid out beside it. Multiple cards fit comfortably on screen without scrolling, regardless of whether the underlying video is 9:16, 1:1, or 16:9.
