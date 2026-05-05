## Problem

The toast "Could not start video generation" appears because the app's TypeScript build is currently failing with 3 errors in `src/modules/generator-ui/pages/DashboardPage.tsx`:

```
(949,98) (993,98) (1112,71)
Argument of type 'MergeProgress' is not assignable to parameter of type 'SetStateAction<number>'
```

`mergeVideoUrls(...)` callback receives a `MergeProgress` object `{ ratio, clipIndex, totalClips }`, but the code calls `setMergeProgress(p)` where `mergeProgress` is typed as `number`. Because the bundle fails to compile cleanly, the most recent client code never reaches the browser and the `jobs-create` POST shows up as `Failed to fetch`, surfacing the generic toast.

## Fix

In `src/modules/generator-ui/pages/DashboardPage.tsx`, convert the `MergeProgress` payload to the percentage number expected by the existing UI (`{mergeProgress}%` on line 1710):

Replace each of the 3 callback sites:

```ts
(p) => setMergeProgress(p)
```

with:

```ts
(p) => setMergeProgress(Math.round(p.ratio * 100))
```

Lines affected: 949, 993, 1112.

No other changes needed — `mergeProgress` stays `number` (0–100), and the existing display `Merging video stack… {mergeProgress}%` continues to work correctly.

## Verification

After the edit, the build should pass and the Start-only image-to-video request (visible in network logs as a valid POST to `/jobs-create` with `firstFrameUrl`) will succeed normally.
