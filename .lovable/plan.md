## Problem

In the Storage modal, some film cards turn into blank black tiles (play button, no thumbnail, no playback) even though they are marked **READY**. The four circled cards in the screenshot are all affected films.

## Root cause (verified against the database)

Each film's playable source is stored in `generator_video_assets.storage_path`. Looking at the actual rows for the affected user:

- Working cards → `https://<project>.supabase.co/storage/v1/object/...` (our own durable storage)
- Blank cards → `https://dashscope-463f.oss-accelerate.aliyuncs.com/...` (the WAN / Alibaba DashScope provider's **temporary** URL)

The provider URL is a short-lived signed link that expires after roughly a day. Once it expires, the browser can no longer load the video, so the card renders black with just a play overlay — exactly what is circled.

Why it happens: when a job completes, the backend calls `materializeVideoUrl()` to persist the result. But that function only downloads and re-hosts `data:` URLs (used by the local-LLM path):

```text
if (!videoUrl.startsWith("data:")) return videoUrl;   // ← provider URL stored as-is
```

For external providers (WAN/DashScope) it stores the expiring provider URL directly. So those films break as soon as the link expires. This is intermittent because it only shows up after expiry, which is why "sometimes" the films disappear.

## Fix (safe, centralized, non-destructive)

Extend `materializeVideoUrl()` in `supabase/functions/_shared/modules/job-orchestrator/gateway.ts` so every completed video is persisted into our own private `merged-videos` storage bucket and a durable URL is stored. Both completion call sites (inline poll at line ~231 and synchronous complete at line ~531) already route through this one function, so a single change fixes all future films.

New behavior inside `materializeVideoUrl`:
1. `data:` URLs → unchanged (current logic).
2. URLs already pointing at our own Supabase storage → return as-is (no needless re-copy).
3. Any other `http(s)` provider URL (DashScope/WAN/etc.) → `fetch()` the bytes, upload to `merged-videos/<userId>/job-<uuid>.mp4`, and return the durable URL.
4. If the external download fails for any reason → log and **fall back to returning the original provider URL** (so the job still completes and stays playable short-term, and credits are never wrongly refunded). This preserves current stability; the change can only improve durability, never break a working flow.

This is fully server-side and changes only how the durable path is produced — no schema change, no client change, no destructive action.

### Existing already-broken films
Films whose provider URL has **already expired** cannot be recovered — the source no longer exists anywhere. Those blank cards can only be deleted by the user. The fix prevents any new film from suffering this and rescues any film whose provider URL is still valid the next time it is completed.

Optional follow-up (only if you want it): a one-time repair pass that re-downloads provider URLs that are *still valid* into our storage. Expired ones are unrecoverable, so this only helps very recent films. I can add this on request.

## Technical changes
- `supabase/functions/_shared/modules/job-orchestrator/gateway.ts` — rewrite `materializeVideoUrl()` to download and re-host external provider videos into `merged-videos`, with a same-origin short-circuit and a safe fallback to the original URL on failure.
- Deploy the updated `jobs-get` / `jobs-create` edge functions (they share this gateway).

## Validation
- Generate (or re-poll) a WAN film and confirm the stored `storage_path` is a `supabase.co/storage/.../merged-videos/...` URL, not a `dashscope` URL.
- Confirm the new card shows a thumbnail and plays in the Storage modal.
- Confirm a film still completes (no false failure/refund) if the download step is forced to fail.
