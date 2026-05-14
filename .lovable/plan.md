# Wire "Flow Video v1" to Google Veo (via Gemini API)

## Goal
The provider currently labelled **Flow Video v1** in the model picker will actually generate videos with **Google Veo 3** through the Gemini API (`generativelanguage.googleapis.com`), reusing the existing `GEMINI_API_KEY` secret. No new keys required.

## Provider summary
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/{veo_model}:predictLongRunning?key=GEMINI_API_KEY`
- Default model: `veo-3.0-fast-generate-001` (fast, includes audio). Optional upgrade: `veo-3.0-generate-001` for higher quality.
- Body for **text-to-video**:
  ```json
  { "instances": [{ "prompt": "..." }],
    "parameters": { "aspectRatio": "16:9", "durationSeconds": 8, "personGeneration": "allow_all" } }
  ```
- Body for **image-to-video** adds `instances[0].image = { bytesBase64Encoded, mimeType }` (we fetch the first-frame URL server-side and inline as base64). Veo supports a single start image; `lastFrameUrl` is ignored (with a server log).
- Returns an LRO `{ "name": "models/.../operations/..." }` — that name becomes our `providerJobId`.
- Poll: `GET https://generativelanguage.googleapis.com/v1beta/{name}?key=...` → when `done: true`, video URI is in `response.generateVideoResponse.generatedSamples[0].video.uri`. The URI requires the API key to download.

## Constraints to handle
- **Duration**: Veo 3 currently supports only **8s clips**. Map UI durations (5/10/15) → 8 and store the real duration we got back. Surface a one-line note in the failure path if the user explicitly relied on 10/15.
- **Aspect ratio**: Veo 3 supports `16:9` and `9:16`. Map `1:1` → `16:9` and log a note (no failure).
- **Storage**: The Veo download URL leaks the API key, so we must fetch the bytes server-side and re-upload to Supabase Storage (`merged-videos` bucket, public) under `${userId}/veo-${jobId}.mp4`, then return that public URL as `videoUrl`. This matches what the rest of the app expects.

## Code changes (backend only)

### `supabase/functions/_shared/modules/external-api-adapter/service.ts`
1. Add Veo model id resolution:
   - `flow-video-1` → `veo-3.0-fast-generate-001` (default)
   - Pass-through for `veo-3.0-generate-001`, `veo-3.0-fast-generate-001` if user explicitly selects.
   - Add cost rows in `COST_MAP`.
2. Update `getProviderApiKey('flow')` to return `Deno.env.get('GEMINI_API_KEY')` (fallback to `FLOW_API_KEY` if set, for forward-compat).
3. Implement:
   - `startVeo(resolvedModel, input, apiKey)` — builds the `:predictLongRunning` payload (t2v vs i2v), POSTs, returns `providerJobId = operationName`.
   - `pollVeo(operationName, apiKey, userId?)` — GET the operation; while not done, return `processing` with a time-based progress (Veo doesn't expose %); on done, download the produced mp4, upload to `merged-videos/${userId}/veo-${uuid}.mp4`, then return `completed` with the public URL, `aspectRatio`, and the `durationSeconds` parameter we sent.
   - For i2v: helper `fetchAsBase64(url)` that GETs the frame URL and returns `{ bytesBase64Encoded, mimeType }`.
4. Wire them into the existing `startGeneration` / `pollGeneration` switch:
   - `if (providerKey === 'flow' && apiKey) ...` — call `startVeo` / `pollVeo`.
5. Keep mock fallback behaviour for when no key is set (already exists).

### Storage + secrets
- No new bucket required; reuse public `merged-videos`.
- Need the Supabase service-role client inside `pollVeo` to upload — the orchestrator already exposes `SupabaseClient` to other callers; thread it through `pollGeneration` (small contract addition: optional `ctx?: { client: SupabaseClient; userId: string }`). Update both contract and the single caller in `job-orchestrator/gateway.ts`.

### `supabase/functions/_shared/modules/external-api-adapter/contract.ts`
- Add the optional `ctx` parameter to `pollGeneration` (and to the matching `AiGateway` interface).

### `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`
- Pass `{ client: svc, userId }` into `pollGeneration` so the Veo poller can upload the finished mp4.

### Frontend
- No changes required. Model picker already shows **Flow Video v1** (`providerKey: 'flow'`, `model: 'flow-video-1'`) and supports both t2v and i2v. The new backend implementation is what makes that selection actually work.
- Update the option's helper sub-label in `MODEL_CHOICES` from "Alternative provider (text or image)" to "Google Veo 3 (8s, 16:9 / 9:16)".

## Out of scope
- No DB migrations (registry already enables `flow`).
- No changes to Wan flow, Library, Regenerate, or any UI logic beyond the helper sub-label.
- No new secret prompts: `GEMINI_API_KEY` is already configured.

## Verification
- Pick "Flow Video v1" + Text-to-Video, prompt-only → job goes `pending` → `processing` → `completed`, mp4 plays from a `merged-videos` public URL.
- Pick "Flow Video v1" + Image-to-Video with a Start frame → same flow, output animates from that frame.
- Pick 1:1 in the composer → backend logs an aspect-ratio downgrade and returns a 16:9 clip without error.
- Pick 10s → backend clamps to 8s and the returned duration in the card reflects 8.
- If `GEMINI_API_KEY` is removed, the call fails with the existing "provider API key missing for flow" error — no regression to Wan.
