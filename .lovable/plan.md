# Fix: Preview lag must never happen

## Problem
When you press PREVIEW, the player (`SequentialClipPlayer`) plays your clips back-to-back in a single video frame. The lag/freeze you see happens **at the boundary between clips**, for two reasons:

1. **On-demand URL resolution.** Each clip's playable URL (proxy / signed storage URL) is only resolved the moment that clip becomes active. During that wait the player shows a spinner instead of the next frame — a visible stall on the first play-through.
2. **No look-ahead buffering.** There is a single `<video>` element that is fully torn down and recreated for every clip (`key` changes per clip). The next clip's video bytes only start downloading after the previous clip ends, so there is a black/loading gap while it buffers.

This is a presentation-layer issue only — generation, Final Film, and audio mixing are untouched.

## Solution (scoped to `SequentialClipPlayer.tsx`)
Make every clip ready *before* it is needed, so transitions are instant. Three safe, additive changes:

1. **Pre-resolve all clip URLs up front.** On mount / when the clip list changes, warm the playable-URL cache for every video clip at once (the existing `usePlayableVideoUrls` batch resolver already does this and shares the same in-memory cache). When a clip becomes active, its URL is already cached, so the spinner gap disappears.

2. **Look-ahead buffering (double buffer).** Render a hidden, muted `<video preload="auto">` for the **next** clip's resolved URL so its bytes are already downloaded/decoded by the time it becomes active. When the active clip ends, the swap is to an already-buffered source — no stall.

3. **`preload="auto"` on the active video** so the browser keeps a healthy forward buffer during a single clip too.

4. **Tidy the duration-preload effects** to resolve through the same proxy path (they currently create throwaway `<video>` elements pointed at the raw, unproxied `src`, which can hang or fail CORS for external providers). Reuse the warmed cache instead of duplicating fetches.

## Out of scope / safety
- No change to job creation, Final Film encoding (`mergeVideosWebCodecs.ts`), audio mixing, or any edge function.
- No change to the proxy/signing logic itself — only *when* it is called.
- Purely additive: if pre-buffering fails for any reason, playback falls back to today's on-demand behavior, so nothing breaks.

## Technical detail
- Add a batch `usePlayableVideoUrls(clips.map(videoSrc))` call to warm the cache; key it on the clip-id/src signature already used by the duration effect.
- Compute `nextIndex` and, when the next clip is a video with a resolved URL, mount an off-screen `<video muted preload="auto" src={nextResolvedUrl}>` (zero-size / `hidden`) to force buffering. Do not attach it to playback logic.
- Keep the active `<video>` element's `key` stable per clip (unchanged) but add `preload="auto"`.
- No new dependencies.

## Verification
1. `bunx tsgo --noEmit` clean.
2. Open PREVIEW on a multi-clip project (like the 9:16 reel in the screenshot) and confirm clips play through with no spinner/black gap at each boundary, including the very first play-through.
3. Scrub across clip boundaries and confirm seeking still works.
4. Confirm music/voiceover stay in sync (soundtrack handlers unchanged).
