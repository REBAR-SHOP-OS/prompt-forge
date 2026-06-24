## Problem

In the Voiceover dialog's "Product narration" section, the product dropdown always shows "No saved products yet" unless the user first opened the Archive dialog.

## Root cause

`DashboardPage.tsx` populates `archiveProductImages` only inside `loadArchive()`, which is invoked exclusively when the Archive dialog opens (lines 7595 and 7610). The Voiceover dialog receives products via:

```
products={archiveProductImages.map(...)}  // line 8806
```

Since users typically open the Voiceover dialog directly (without first opening Archive), `archiveProductImages` is still empty, so the saved products never appear. This is a data-loading/timing bug, not a missing-data or RLS problem.

## Fix

Ensure products are loaded whenever the Voiceover dialog opens.

- Add a `useEffect` in `DashboardPage.tsx` that, when `isVoiceoverOpen` becomes `true`, triggers a load of the user's product images if they haven't been loaded yet (e.g. `archiveProductImages.length === 0`).
- Reuse the existing `loadArchive()` function for consistency (it already signs URLs and splits product vs. general images), guarded so it doesn't refetch needlessly.

This keeps the change purely in the frontend presentation/data-fetch layer and touches no backend, billing, or generation logic.

## Technical details

File: `src/modules/generator-ui/pages/DashboardPage.tsx`

Add near the other Voiceover state/effects:

```ts
useEffect(() => {
  if (isVoiceoverOpen && archiveProductImages.length === 0) {
    void loadArchive()
  }
}, [isVoiceoverOpen])
```

(Place after `loadArchive` and `isVoiceoverOpen` are defined; keep the dependency list minimal to avoid repeated fetches.)

## Verification

- Build/typecheck clean.
- With at least one saved product, open Voiceover → Product narration without opening Archive first → the product now appears in the list.
- Confirm in the published preview that the dropdown no longer shows "No saved products yet" when products exist.
