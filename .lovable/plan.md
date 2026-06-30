## Problem
In the "Generate image with AI" dialog, choosing a tagline ("with text") — or using "Write prompt" / "Without text" — triggers a call to the `write-image-prompt` edge function in its default `prompt` mode. That mode immediately calls `instructionParts.push(...)`, but the `instructionParts` array is **never declared** in that branch. The undeclared reference throws a `ReferenceError`, which the function's catch block converts into a 500 `{ "error": "Internal error" }` — exactly the "Internal error" shown in the screenshot.

The `taglines` mode works (it returns the list), so generating taglines succeeds; the crash only happens on the second call that actually builds the final prompt.

## Fix
In `supabase/functions/write-image-prompt/index.ts`, declare the missing array right after the `taglines` mode block ends (before line 197):

```ts
const instructionParts: string[] = [];
```

That single declaration makes all the existing `instructionParts.push(...)` calls (lines 198–222) and `instructionParts.join(" ")` (line 223) valid, so the function returns a proper prompt instead of crashing.

## Verification
- Redeploy the edge function.
- Call `write-image-prompt` with `includeAdCopy: true` and a `tagline` to confirm it returns `{ prompt: "..." }` with HTTP 200 instead of 500.
- Confirm the "Without text" path (`includeAdCopy: false`) also returns a prompt.

No UI, auth, storage, or generation-logic changes are needed — this is a one-line backend fix scoped strictly to the broken branch.