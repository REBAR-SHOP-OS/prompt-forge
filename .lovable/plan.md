# Fix preview video lag

I found more likely lag sources besides the old global progress ticker. The fix should stay frontend-only and avoid touching generation, auth, storage, or backend code.

## 1. Stop transition icons from re-rendering React at animation-frame speed

File: `src/modules/generator-ui/components/TransitionPreview.tsx`

- The transition chips in the right rail currently run a `requestAnimationFrame` loop that calls `setT(progress)` every frame.
- Multiple mounted transition icons can force React updates while the large Preview video is playing.
- Replace the per-frame state update with direct DOM style updates via refs (`aRef`, `bRef`).
- Optionally throttle icon animation to ~24fps because these are small decorative thumbnails.
- Keep the same visual output and API.

## 2. Make rail/card video thumbnails static when a poster exists

File: `src/modules/generator-ui/components/PlayableVideo.tsx`

- In `thumbnail` mode, if a poster exists and the caller did not request `controls` or `autoPlay`, render only the poster image.
- This prevents many hidden/paused `<video>` elements from competing with the main Preview video for decoder and network resources.
- Keep the existing video fallback for cards with no poster, and for any explicit interactive/autoplay usage.

## 3. Remove controls from pending-card thumbnails

File: `src/modules/generator-ui/pages/DashboardPage.tsx`

- The small right-rail working clip thumbnails do not need independent video controls while the large Preview is open.
- Remove the `controls` prop from those thumbnail `PlayableVideo` cards and make the tile video pointer-passive.
- Clicking the card should still select it for the main Preview exactly as before.

## 4. Prevent ResizeObserver from causing duplicate parent re-renders

File: `src/modules/generator-ui/pages/DashboardPage.tsx`

- Guard `setPreviewMaxHeightPx` and `setPreviewVideoSize` so they only update state when the measured value actually changes.
- This avoids expensive `DashboardPage` re-renders from tiny/duplicate layout observations during playback.

## Expected result

The main Preview video should no longer stutter from decorative React animation loops, thumbnail video decoders, or redundant layout-state updates. Final film generation remains unchanged.