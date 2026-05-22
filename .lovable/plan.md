
## Problems

1. **Some clip cards stay in Pending forever and never execute.**
   Investigation of `jobs-create` / `jobs-get` shows that after the provider call (`startGeneration`) the job is marked `processing` and the UI polls `/jobs-get` every 4–20s. Two paths can leave a card stuck:
   - `markProcessing` is called with `gen.providerJobId`. If that is `null/undefined` (some providers return it asynchronously, or a transient failure inside `startGeneration` is swallowed), the row sits in `processing` with `provider_job_id = NULL`. The inline poll in `jobs-get` gateway only runs `aiGateway.pollGeneration` when `detail.provider_job_id` is truthy — so the card never advances and only the 15–45min stuck-timeout eventually fails it (very late, looks like “nothing happened”).
   - When `request("/jobs-create")` rejects on the client (network blip, 502 from `PROVIDER_ERROR`), no seeded card is added, but if the server already created the row before failing `startGeneration`, the row is correctly failed+refunded — fine. However when the client *succeeds* but `gen.providerJobId` is missing, we get the silent-stuck case above. There is currently **no client-side guard** that re-queues / surfaces this — the user just sees a pending card that never moves.

2. **Final-film MP4 doesn’t play in external players (VLC, QuickTime, WMP, mobile gallery).**
   `mergeVideoUrls` records the canvas via `MediaRecorder` with `video/mp4;codecs=avc1,mp4a`. Chromium’s MediaRecorder writes **fragmented MP4 with the `moov` atom at the END**, no `mvhd` timescale that mobile players like, and a variable framerate. Web players play it fine, but most desktop/mobile players either show audio only, a black frame, or refuse to open the file. The download path already uses blob (good), so the bug is the file itself, not the download.

## Plan

### 1. Stop pending cards from getting silently stuck

In `supabase/functions/_shared/modules/job-orchestrator/gateway.ts` (`createJob` branch):

- If `gen.providerJobId` is empty AND `gen.isComplete` is false, treat it as a provider failure:
  - call `jobService.failJob(... refundCredits: true)` with reason `"Provider did not return a job id"`,
  - return `502 PROVIDER_ERROR` so the client toast surfaces it.
- Log a structured warning when this happens so we can see real frequency in edge-function logs.

In `gateway.ts` (`getJob` branch):

- For jobs in `processing`/`pending` with `provider_job_id IS NULL` older than ~60s, force-fail with refund and a clear reason `"Provider never returned a job id — credits refunded"`. Today only the long 15–45min timeout catches them.

In `DashboardPage.tsx` polling effect:

- When `getJob` returns `status==='failed'`, also pop a one-shot inline message on the card (`status_message`) so the user understands why it never started.

### 2. Make final-film MP4 universally playable

Pick one of the two implementations (recommend (a), it’s entirely client-side and avoids server cost):

**(a) Client-side remux to a faststart MP4 with `mp4box.js`** (recommended)

- Add `mp4box` dependency.
- New helper `remuxToFaststartMp4(blob): Promise<Blob>` in `src/modules/generator-ui/lib/mergeVideos.ts`:
  - Feed the recorder output through `MP4Box.createFile()` after appending the recorded ArrayBuffer.
  - Use `mp4box.flush()` and `mp4box.getBuffer()` to produce a re-muxed file with `moov` at the front and a constant timescale.
  - If remux fails for any reason, fall back to the original blob (current behavior) so we never regress.
- In `mergeVideoUrls`, after `MediaRecorder.stop()` resolves, when the chosen mime is MP4, pipe the result through `remuxToFaststartMp4` before returning. WebM output stays unchanged.

**(b) Server-side ffmpeg edge function fallback** (only if (a) is rejected)

- New `supabase/functions/video-remux/index.ts` that accepts a signed URL, runs `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4` (via the existing ffmpeg-wasm binding used by other functions, or via a lambda relay) and returns the new blob.
- DashboardPage calls this once on Final-Film completion and stores the remuxed asset in `generator_video_assets` as the canonical playback/download path.

### 3. Verification

- Manually finalize a multi-clip film, download the MP4, open in VLC + QuickTime + WhatsApp preview — must play with video + audio.
- Submit several text-to-video jobs in a row; confirm no card stays Pending past ~60s without either advancing or surfacing a clear failure with refund.

## Files touched

- `supabase/functions/_shared/modules/job-orchestrator/gateway.ts` — providerJobId guards + 60s null-provider-id timeout.
- `src/modules/generator-ui/pages/DashboardPage.tsx` — surface stuck-job failure message; minor only.
- `src/modules/generator-ui/lib/mergeVideos.ts` — post-record remux to faststart MP4.
- `package.json` — add `mp4box`.

No DB schema changes required.
