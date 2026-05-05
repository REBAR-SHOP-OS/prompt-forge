
# Speed Optimization Plan

Profiling showed three real causes of perceived slowness. None of them is a JS hot-loop (CPU stays under 1%). Each fix is independent and non-destructive.

## Findings

1. **Initial load ~9s in dev preview.** 44 separate script requests, with `lucide-react` (155 KB / 2.1 s) and `@supabase/supabase-js` (131 KB / 1.7 s) being the largest. `DashboardPage.tsx` itself is 60 KB and loaded eagerly even on the login screen.
2. **Polling effect restarts on every state change.** The `useEffect` that polls in-flight jobs depends on the entire `generatedVideos` array. Every `progress_percent` update creates a new array reference → effect cleans up + re-runs → timer is reset. Wasteful and causes extra renders.
3. **Right-column "Outputs" renders a full `<video controls>` element per generated clip.** Each `<video>` opens a decode pipeline. With 5–10 clips this noticeably slows scrolling, focus changes, and re-renders.

## Fixes

### 1. Lazy-load the dashboard route
- Convert `DashboardPage` import in `src/App.tsx` to `React.lazy(() => import(...))` and wrap the render in `<Suspense>` with a minimal loader.
- Result: unauthenticated users no longer pay the 60 KB + transitive cost; authed users see the login fallback faster on cold loads.

### 2. Stabilize the polling loop
In `src/modules/generator-ui/pages/DashboardPage.tsx`:
- Replace the `[generatedVideos]` dependency with a memoized **list of active job IDs** (`useMemo` joining IDs into a string), so the effect only re-subscribes when the *set of active jobs* actually changes — not on every progress tick.
- Keep the current `setTimeout` cadence (4 s) but read fresh `generatedVideos` via a `ref` inside the timer callback.
- Use `Promise.allSettled` instead of `Promise.all` so one failed `getJob` doesn't blank the whole batch.

### 3. Lightweight video cards in the Outputs column
Replace each `<video controls>` card with a click-to-expand pattern:
- Default state: a `<video>` with `preload="metadata"` and **no `controls`**, rendering only the poster frame (first frame). No decode pipeline runs until clicked.
- Clicking the card calls the existing `startPreviewVideo(video.id)` (already wired) which moves playback to the large center stage — that's where users actually watch.
- Add a small play icon overlay so the affordance is obvious.
- Keep the bookmark + delete buttons unchanged.

This single change typically takes the right column from "noticeably laggy with 5+ clips" to instant.

### 4. Minor wins (bundled with above)
- Memoize `completedVideos`, `approvedIds`, and the cards' click handlers with `useCallback` so toggling the bookmark on one card doesn't re-render every other card.
- Add `React.memo` around the card subcomponent (extracted as a small inline component) so each card only re-renders when its own props change.

## Files touched

- `src/App.tsx` — lazy import + Suspense fallback
- `src/modules/generator-ui/pages/DashboardPage.tsx` — polling effect, card extraction, memoization, `<video>` simplification

## Out of scope (and why)

- **Video generation time itself** (the "stuck at 95%") is provider-side (wan2.7). I won't lower the polling interval below 4 s — that would only increase backend cost without speeding up the actual render. I'll surface progress more honestly: while polling, show the timestamp of the last update so the user can see we're still alive.
- **Replacing `lucide-react` with per-icon imports** isn't needed — modern lucide-react already tree-shakes in production builds; the 2 s cost only appears in Vite dev mode.

## Expected outcome

- Cold load (dev preview): ~9 s → ~5 s (lazy dashboard)
- Outputs column with 10 clips: smooth scroll, instant toggle (was visibly laggy)
- Network: same poll cadence but no redundant restarts; failed pings no longer drop the whole batch
