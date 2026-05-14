# Veo 10s / 15s Support via Video Extension

## Diagnosis

Veo 3.1 in a single call can only generate **4, 6, or 8 second** clips. It does not have a "10s" or "15s" parameter. That's why we currently reject those durations with `VEO_DURATION_UNSUPPORTED`.

However Veo 3.1 ships a separate **video extension** feature on the same `predictLongRunning` endpoint: pass a previously generated Veo video plus a new prompt, and it appends **+7 seconds** to it (up to 20 extensions, max 141s input). This lets us deliver 10s and 15s outputs without changing providers.

| Target | Strategy |
|---|---|
| 5s | 1 call, `durationSeconds = 6` (closest valid), trim 1s on the merger. Or accept 6s output. |
| 8s | 1 call, `durationSeconds = 8`. (already works) |
| 10s | 1 call at 8s + 1 extension = 15s, trim 5s. |
| 15s | 1 call at 8s + 1 extension = 15s. Exact. |

Trim on the merger uses the existing client-side `trimVideo.ts` already used for clip trimming, so no new server tooling.

## Fix (server-side only, then a small UX update)

### 1. `service.ts` — add a Veo extension flow

Inside the adapter, when the orchestrator requests a Veo job with `durationSeconds > 8`:

- `startVeo` records `targetDurationSeconds` (10 or 15) in an in-memory map keyed by the operation name (next to `veoStartedAt`).
- Generate clip 1 at `durationSeconds = 8` as today.
- `pollVeo` detects the `targetDurationSeconds` is set: when the LRO completes, instead of finalizing, immediately POST a second `predictLongRunning` call with:
  - `instances[0].video = { uri: <clip 1 uri> }` (the Veo-internal uri returned by the first response — Veo's extension endpoint requires this, not a re-uploaded mp4)
  - same prompt
  - `parameters.resolution = "720p"`
- Track the new operation name; `pollVeo` continues to drive progress (split 0–50% for clip 1, 50–100% for extension).
- When extension completes, download the resulting mp4 (Veo returns the **combined** 15s video in one URI), upload to `merged-videos`, and return `completed` with `duration = targetDurationSeconds`.

For the 10s case, we set `duration = 10` in the result and expose a flag so the existing video pipeline trims the final 5s on the client (using `trimVideo.ts`). If client-side trim integration turns out to require additional plumbing, the safe fallback is to deliver a 15s clip for both 10s and 15s requests and surface a one-line note in the UI.

### 2. `gateway.ts` — remove the up-front 10s/15s rejection for Veo

The `VEO_DURATION_UNSUPPORTED` gate added earlier is no longer needed. Replace it so Veo accepts 5/8/10/15. Wan path unchanged.

### 3. State persistence note

The `targetDurationSeconds` map is in-memory (same lifetime as `veoStartedAt`). If the edge function restarts mid-render the extension step is lost. To make this resilient we'd need to persist the chained state — out of scope for this round; if it becomes a real issue we'll move it into `generator_generation_jobs` as a small JSON column.

## Out of scope

- No Wan changes.
- No DB migration in this round (in-memory state is acceptable for the current scale; documented above).
- No new secrets.
- No frontend layout changes; the duration buttons keep their current behavior.

## Verification

1. Veo, 8s, Start+End → unchanged (1 call).
2. Veo, 15s, Start only → 8s clip + extension → final 15s mp4 in History, single card, single download.
3. Veo, 10s, Start only → 15s pipeline + 5s client trim → 10s in History.
4. Veo, 15s, Start+End → first clip uses lastFrame interpolation, extension uses the new prompt only (lastFrame applies to the first 8s — Veo behavior). Document this nuance in the result.
5. Wan unchanged.
6. Edge logs: no `VEO_DURATION_UNSUPPORTED`, no `veo last_frame ignored`, two `veo create` entries per long Veo job (one per LRO).

## Open question

For 10s, do you want:

- **A.** Accurate 10s output (trim 5s off the 15s extension result on the client). More moving parts.
- **B.** Always deliver 15s when 10s is requested (cleanest, no trim, but the duration label won't match).

I'll proceed with **A** unless you say otherwise.
