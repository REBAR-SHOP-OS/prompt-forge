## Problem

When the user picks 9:16 (Reels) or 1:1 (Post), the generated clip is correct, but the **main preview stage** still appears as a wide 16:9-shaped black box with the actual video letterboxed inside it (visible in the screenshot — tall portrait video sitting in a wide dark frame).

## Root cause

In `src/modules/generator-ui/pages/DashboardPage.tsx` the main preview is structured as:

```text
<div class="w-[min(96rem, 100vw-26rem)]">         ← outer wrapper, ~very wide
  <div class="rounded border bg-…">               ← card chrome
    <div class="max-h-[82vh] w-full"               ← stage box
         style={{ aspectRatio: '9 / 16' }}>
      <video class="h-full w-full object-contain" />
    </div>
  </div>
</div>
```

The inner stage uses `w-full` + `aspectRatio`. With `w-full ≈ 1500px` and `aspect-ratio: 9/16`, CSS would compute height ≈ 2666px. `max-h-[82vh]` then *clips* the visible height but **does not shrink the box's width**. Result: the box stays ~1500px wide while the `<video object-contain>` inside fits a 9:16 frame and pillarboxes. That's the wide dark frame in the screenshot.

The history thumbnails and approved-panel previews are fine — they live in narrow grid cells, so `w-full + aspectRatio` produces the right shape. Only the hero preview is broken.

## Fix

Drive the stage size from **height** rather than width, so for any ratio the box's width is computed from the available viewport height. The outer wrapper becomes a centering flex layout instead of a fixed-width column.

Concretely, in `DashboardPage.tsx` around lines 1601–1608, replace the outer wrapper + stage box with:

```tsx
<main className="grid min-h-screen place-items-center px-4 pb-40" aria-live="polite">
  {previewVideo ? (
    <div className="-translate-y-6 sm:-translate-y-4 flex w-full justify-center">
      <div className="overflow-hidden rounded-[22px] border border-white/10 bg-[#07080a]/90 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur">
        <div
          className="relative overflow-hidden bg-black"
          style={{
            aspectRatio: ratioToCss(getRatioFor(previewVideo)),
            height: 'min(82vh, calc(100vw - 26rem))',
            // height drives size; width = height * ratio. For 9:16 a tall box;
            // for 16:9 a wide box; for 1:1 a square. All bounded by viewport.
            maxWidth: 'calc(100vw - 26rem)',
          }}
        >
          {/* …existing <video> / placeholder… */}
        </div>
      </div>
    </div>
  ) : ( /* …unchanged empty state… */ )}
</main>
```

Why this works:
- For **9:16**: height = 82vh → width = 82vh × 9/16 (a tall, narrow stage).
- For **1:1**: height = 82vh → width = 82vh (a square stage).
- For **16:9**: height tries 82vh × 16/9, but `maxWidth: calc(100vw - 26rem)` clamps width and `aspect-ratio` recomputes height — yielding the familiar wide stage capped by the right-hand history panel.

No other preview surfaces need changes; per-job ratio tracking (`getRatioFor`, `clipAspectRatios`, merged-entry ratio, backend `ratio` on i2v) from the previous round is already correct.

## Files touched

- `src/modules/generator-ui/pages/DashboardPage.tsx` — only the main preview stage container (≈ lines 1601–1608).

## Out of scope

- Backend, merging logic, history thumbnails, approved panel — already correct.
- No changes to layout of the right-hand history sidebar or the bottom prompt bar.

## Verification

1. Pick **9:16 Reels**, generate → main preview is a tall portrait box with no side bars.
2. Pick **1:1 Post**, generate → main preview is a centered square.
3. Pick **16:9 YouTube**, generate → main preview is the wide stage as before.
4. Resize the viewport: stage scales but never overflows the viewport height (82vh) or collides with the history sidebar.
