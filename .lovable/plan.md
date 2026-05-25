
# Full-Video Analysis Before V2V Edit

## Problem
Today, `Apply AI edit` only captures the **first frame** of the source video and sends it to Veo with the user's prompt. Veo never "sees" the rest of the clip — motion, subject behavior, scene changes, props, environment continuity are all guessed from one still frame. The result often drifts from the original.

The user wants the model to **first analyze the whole video**, then apply the requested change while preserving everything else.

## Approach

Use Gemini multimodal (which natively accepts video) to **describe the source video in detail**, merge that description with the user's edit instruction into a single rich prompt, then send that prompt + the first frame to Veo for generation. Veo itself does not accept video input on our current adapter (`flow-video-1` is image-to-video), so the "full-video understanding" step is done by Gemini and injected into the Veo prompt.

```text
[Source video] ──► Gemini 2.5 Pro (video understanding) ──► Scene description
                                                                │
[User prompt: "change the ball"] ───────────────────────────────┤
                                                                ▼
                                                  Augmented prompt
                                                                │
[First frame snapshot] ─────────────────────────────────────────┤
                                                                ▼
                                                       Veo (flow-video-1)
                                                                │
                                                                ▼
                                                       Edited video
```

## What changes

### 1. New edge function `video-analyze`
- Input: `{ videoUrl }` (must be publicly fetchable — same `wan-frames` style public URL, or proxied).
- Downloads the video bytes server-side, uploads to Gemini Files API, then calls `google/gemini-2.5-pro` via the Lovable AI Gateway with the video part + a structured analysis prompt.
- Returns a tight JSON: `{ summary, subjects[], camera, motion, lighting, environment, duration_seconds, key_moments[] }`.
- Auth required, rate-limited via existing `_shared/core/ratelimit.ts`.

### 2. `VideoToVideoDialog.tsx` flow update
New stages shown to the user:
1. `Analyzing video…` → calls `video-analyze` with the source `videoUrl`.
2. `Capturing reference frame…` → existing first-frame snapshot.
3. `Uploading reference frame…` → existing upload.
4. `Sending to video model…` → existing `jobOrchestratorGateway.createJob`, but with the **augmented prompt**:
   ```
   USER EDIT INSTRUCTION:
   <user prompt>

   ORIGINAL VIDEO ANALYSIS (preserve everything below unless explicitly changed above):
   - Summary: ...
   - Subjects: ...
   - Camera: ...
   - Motion: ...
   - Lighting: ...
   - Environment: ...
   - Key moments: ...

   Rules: keep composition, camera angle, framing, lighting, subject identity, and motion
   identical to the analysis. Only apply the user's edit instruction. Do not add new subjects
   or change the environment unless asked.
   ```
5. Seeds the `JobDetail` into Pending as today.

The dialog gets a new busy stage label and a hard timeout (~45s) on the analyze step. Errors from analyze surface in the existing red error line; the edit can still proceed without analysis if the user retries (fallback path: if analyze fails, fall back to current first-frame-only behavior with a warning, so the feature never becomes a hard blocker).

### 3. No DB schema changes
The augmented prompt is stored in `generator_generation_jobs.input_prompt` like any other prompt. No new tables, no new buckets.

### 4. No changes to Veo adapter
`flow-video-1` already takes prompt + first frame. We only enrich the prompt.

## Technical notes
- Gemini Files API accepts videos up to ~2GB; our source clips are ≤15s so size is fine.
- Use `google/gemini-2.5-pro` (best multimodal reasoning) with a strict JSON-schema tool call to guarantee parseable output.
- The edge function fetches the video via `fetch(videoUrl)` server-side, so CORS in the browser is not a concern.
- Cost: one extra Gemini call per edit (~$0.01-0.03 per 15s clip). Acceptable for an explicit user action.
- Latency: adds ~5–15s before Veo is kicked off. Stage label keeps the user informed.

## Files touched
- **new** `supabase/functions/video-analyze/index.ts`
- **new** `supabase/functions/_shared/modules/external-api-adapter/videoAnalysis.ts` (helper that wraps the Gemini call)
- **edit** `src/modules/generator-ui/components/VideoToVideoDialog.tsx` (add analyze step + augmented prompt + new stage strings + fallback)
- **edit** `supabase/config.toml` (register new function, `verify_jwt = true`)

## Out of scope
- True video-to-video (Veo currently doesn't accept video input in our adapter). If/when we add Runway Gen-3 V2V, the same augmented prompt + analysis becomes the input to that provider too — no rework needed.
- Per-frame editing or temporal masks.

## Validation
1. Open a Pending clip → ✨ → type "change the hard hat to red" → Apply.
2. Stage label cycles: `Analyzing video…` → `Capturing reference frame…` → `Uploading…` → `Sending to video model…` → dialog closes.
3. New Pending card appears; in `generator_generation_jobs.input_prompt` the row contains both the user instruction and the analysis block.
4. Final Veo output preserves composition/lighting/subject and only changes the hard hat.
5. Force analyze to fail (bad URL) → dialog shows warning but still proceeds with first-frame-only path.
