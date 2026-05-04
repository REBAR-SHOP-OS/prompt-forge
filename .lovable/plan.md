## Root cause (verified against the official Wan i2v docs)

The "no video is created" symptom has **two independent causes** that both fire today:

### 1. Wrong DashScope model id (server-side, the real blocker)
- We send `model: "wan2.7-i2v"` to DashScope.
- The official Wan image-to-video API only accepts the dated id `wan2.7-i2v-2026-04-25` (docs page section 757, 762: *"Example: wan2.7-i2v-2026-04-25"*).
- DashScope rejects bare `wan2.7-i2v` → `startGeneration` throws → gateway marks the job **failed** → user sees a job that never produces a video.
- The DB row in `core_ai_provider_registry` for `wan` still has `default_model = 'wan2.7-i2v'`, and the `COST_MAP` in `external-api-adapter/service.ts` keys on `wan2.7-i2v`. Both must move to `wan2.7-i2v-2026-04-25`.

### 2. Silent submit on the active dashboard (frontend)
- The route `/` renders `src/modules/generator-ui/pages/DashboardPage.tsx` (not the `GenerateVideoCard` we previously fixed).
- That page disables the render button when both Start + End frames aren't `status: 'ready'`, but **shows no per-file upload state and no reason** when the click does nothing. Users can't tell the upload is still in flight or failed.
- We also never show the create-job error inline on the composer — it goes to a side message that's easy to miss.

### Secondary cleanup (small, but worth doing while we're here)
- Polling parses `usage.video_duration` / `usage.video_ratio`, but the real fields are `usage.duration` and `usage.SR`. Wrong values get stored as aspect ratio/duration on the asset.
- Provider registry still lists `flow` as enabled; harmless now (frontend literal blocks it) but misleading.

---

## Plan

### A. Backend — use the correct Wan model id
1. Update `core_ai_provider_registry`: set `wan.default_model = 'wan2.7-i2v-2026-04-25'`.
2. Update `COST_MAP` in `supabase/functions/_shared/modules/external-api-adapter/service.ts` to key on `wan2.7-i2v-2026-04-25` (drop the bogus `wan2.7-i2v` entry; keep `wan-video-1` as a fallback).
3. In `startWanI2V`, add `parameters: { resolution: "720P", duration: 5, prompt_extend: true, watermark: false }` (sane defaults the docs require/recommend).
4. In `pollWanI2V`, read `usage.duration` and `usage.SR` instead of `video_duration` / `video_ratio`.
5. Improve provider error surfacing: include `request_id` from DashScope in the thrown error so logs show exactly why a task was rejected.

### B. Frontend — make the active dashboard honest about what's happening
File: `src/modules/generator-ui/pages/DashboardPage.tsx`

1. Render per-frame status under the composer:
   - "Uploading Start frame…" / "Uploading End frame…" while `status==='uploading'`.
   - Failure message + retry hint when `status==='failed'`.
   - Small thumbnail + ✓ when `status==='ready'`.
2. When the user clicks Render and `canSubmit` is false, surface the actual reason inline (missing Start, missing End, still uploading) instead of doing nothing.
3. Show the `createJob` error inline on the composer (currently only set on the side column message).
4. Keep the existing 4 s polling loop — it already drives the inline polling in `jobs-get`.

### C. Verify end-to-end
1. Apply migration + redeploy `jobs-create` and `jobs-get`.
2. From the preview, upload a Start + End image, prompt "smooth zoom in", click Render.
3. Confirm in `audit_api_request_logs` that the call returns 200, then watch `generator_generation_jobs` flip from `processing` → `completed` and `generator_video_assets` get a row with `storage_path` pointing to the DashScope OSS URL.
4. If DashScope still rejects, the error string will now include its `request_id`, so we can pinpoint it from one log line.

## Out of scope (intentional)
- We do **not** download the DashScope OSS file into our own storage yet. Their URLs expire in 24 h; if the user wants permanent storage we add a follow-up step that streams the file into a `wan-videos` bucket on completion.
- We do not re-introduce the `flow` provider.
