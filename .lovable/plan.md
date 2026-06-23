# Fix video generation PROVIDER_ERROR

## Problem
When starting a video generation, the request fails with:
`PROVIDER_ERROR: The video provider could not start generation. Please try again.`

The edge function log reveals the true cause:
```
startGeneration failed — "resolveDownloadableFrameUrl is not defined"
```

## Root cause
In `supabase/functions/_shared/modules/external-api-adapter/service.ts`, a previous edit pasted the helper `resolveDownloadableFrameUrl` (lines 734–760) **into the middle** of the `fetchAsInlineData` function:

- Line 732 `}` closes `fetchAsInlineData` too early (it was meant to close the inner `if (ownStorage)` block).
- The plain-`fetch` fallback (lines 762–766) and a trailing `}` are now stranded at module top level, where `url` does not exist.
- This stray top-level code breaks module evaluation, so `resolveDownloadableFrameUrl` is never defined → the runtime error → the generic `PROVIDER_ERROR` shown to the user.

## Fix (single file, structure-only, no behavior change)
`supabase/functions/_shared/modules/external-api-adapter/service.ts`

Reorder the two functions to their correct, separate shapes:

```text
async function fetchAsInlineData(url) {
  const ownStorage = parseOwnStorageObject(url);
  if (ownStorage) {
    ... service-role download ...
    return { mimeType, data };
  }                       // <-- close the if block here
  const r = await fetch(url);
  if (!r.ok) throw ...;
  ... 
  return { mimeType, data };
}                         // <-- close fetchAsInlineData here

async function resolveDownloadableFrameUrl(url) {
  ... (unchanged body) ...
}
```

Concretely:
1. Add the missing closing `}` for the `if (ownStorage)` block inside `fetchAsInlineData`.
2. Move the dangling fallback `fetch` block (currently lines 762–766) back inside `fetchAsInlineData`, after the `if` block.
3. Keep `resolveDownloadableFrameUrl` as a separate top-level function with its existing body.

No logic, signatures, or provider behavior change — purely repairing the misplaced braces/blocks.

## Validation
1. Deploy the affected edge functions (`jobs-create` and shared adapter).
2. Trigger an image-to-video generation (Wan i2v) from the UI.
3. Confirm the job starts (status `processing`, no `PROVIDER_ERROR`) and check `jobs-create` logs show no `resolveDownloadableFrameUrl is not defined`.

## Risk
Minimal — isolated to one file, restoring previously-working structure. Credits/refund logic and provider calls are untouched.
