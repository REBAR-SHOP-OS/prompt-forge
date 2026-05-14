# Veo Provider — Two Root-Cause Fixes

## Diagnosis (from edge function logs)

The current image-to-video failure is **not** a network/transient issue. Veo returned:

```
400 INVALID_ARGUMENT: "allow_all for personGeneration is currently not supported."
```

Our code in `supabase/functions/_shared/modules/external-api-adapter/service.ts` (`startVeo`) hardcodes `personGeneration: "allow_all"`, which Google deprecated. Every Veo call therefore fails immediately with `PROVIDER_ERROR`, regardless of duration or image input.

The 10s/15s failure has the **same root cause** plus a second, real constraint: Veo 3 only renders a single clip of fixed length (8s for `veo-3.0-fast-generate-001`). Even after the personGeneration fix, asking Veo for 10s or 15s in one call is impossible — we must generate multiple clips and chain them.

## Fix 1 — Remove the unsupported parameter (unblocks all Veo calls)

In `startVeo` (service.ts), drop `personGeneration: "allow_all"`. Default Veo behavior is acceptable; if we ever need person controls later, the supported value is `"allow_adult"` (not `"allow_all"`). Single-line change.

## Fix 2 — Make 10s and 15s actually work for Veo

Veo 3 fast renders fixed 8s clips and does not accept a `lastFrame`. To deliver a 10s or 15s output, the orchestrator must:

1. Generate clip 1 (8s) with the user's first frame.
2. After clip 1 completes, extract its **last frame** (server-side, via the existing video tooling already used for thumbnailing / `mergeVideos`) and feed it as the `firstFrameUrl` of clip 2.
3. Generate clip 2 with the remaining target length. Since Veo only outputs 8s clips, clip 2 will also be 8s; trim to the target on the merger step:
   - 10s → 8s + trim(2s)
   - 15s → 8s + trim(7s)
4. Stitch the two clips into one job output using the existing merge pipeline so the user sees a single 10s/15s video in the History card.

To keep scope small and deterministic, this Fix 2 is implemented as an **adapter-level chain inside `startVeo` / `pollVeo`**:

- `startVeo` records the requested `targetDurationSeconds` (10 or 15) in the in-memory state alongside `veoStartedAt`.
- `pollVeo`, on completion of clip 1, kicks off clip 2 instead of returning `completed`, keeping `status: "processing"` and updating progress to ~50%.
- On clip 2 completion, it downloads both mp4s, concatenates them with the existing ffmpeg-less merger we already use for Wan multi-clip output (or falls back to returning two source URLs the merger handles), trims to target, uploads to `merged-videos`, and returns `completed`.

If the chaining infrastructure turns out to require frontend merger involvement (which it does in this codebase — merging happens client-side in `mergeVideos.ts`), then the simpler safe variant is:

- Treat a 10s/15s Veo request as **two sequential jobs** at the orchestrator layer: when `providerKey === "flow"` and `durationSeconds > 8`, split into 2 child jobs in `jobs-create`, return both job IDs, and let the existing Final-Film/merge path stitch them. This keeps all video composition on the proven client merger and avoids new server-side ffmpeg.

## Out of scope

- No change to Wan provider.
- No DB migration.
- No UI change beyond what's needed to surface the two child jobs (only if we go with the orchestrator-split variant).

## Verification

1. Image-to-video, 5s, Veo → succeeds (validates Fix 1).
2. Text-to-video, 5s, Veo → succeeds.
3. Image-to-video, 10s, Veo → produces a 10s clip (or 2 chained 8s clips merged to 10s).
4. Image-to-video, 15s, Veo → produces a 15s clip.
5. Wan provider unaffected.
6. Edge function logs no longer show `allow_all for personGeneration`.

## Decision needed

For Fix 2, which variant do you prefer?

- **A. Adapter-level chaining** (single job ID, server stitches). More invasive, needs server-side video concat.
- **B. Orchestrator split into 2 jobs** (reuses existing client merger). Simpler, safer, but the History panel will briefly show 2 cards before merge.

Fix 1 ships either way and immediately unblocks 5s/8s Veo generations.
