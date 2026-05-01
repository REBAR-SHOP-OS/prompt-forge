# Domain cutover plan: video-library

**Cutover order: 4 of 6** (listings only today; future writes via storage.)

## Surface today

- Backend gateway: `supabase/functions/_shared/modules/video-library/gateway.ts`
- Edge endpoint: not yet wired (planned Phase 5+).
- Frontend gateway: `src/modules/video-library/gateway.ts` (stub returns `[]`)
- Tables read (RLS-enforced): `generator_video_assets`
- Tables written: none today; future inserts will be service-role from the
  generation worker after a job completes.

## Why fourth

- Cut over before `job-orchestrator`, because completed jobs reference video
  assets. Having the read-side new surface ready first lets job-orchestrator
  cut over without a coupled change.
- Today's stub means cutover is a pure ingress switch.

## Phases

| Phase         | Action                                                                   |
|---------------|--------------------------------------------------------------------------|
| `active`      | Current state. Default.                                                   |
| `dual-write`  | When asset writes exist (Phase 5+), insert into both old and new tables.  |
| `shadow-read` | Compare list payloads for same user JWT.                                  |
| `cutover`     | Frontend `videoLibraryGateway.listMyVideos` points at new edge endpoint.  |
| `frozen`      | Asset writers reject inserts. Brief window before commit.                 |
| `rolled-back` | New writers refuse; old continues.                                        |

## Freeze-write plan

When asset writes exist:
1. `CUTOVER_VIDEO_LIBRARY=frozen` on the old asset writer.
2. Drain pending generation jobs (max 1 active job worker tick — currently
   single-tenant; raise as worker count grows).
3. Flip new writer to `cutover`.

## Dual-write plan

- Only needed once writes exist. Strategy then: insert in old first, then new
  inside a single edge function transaction; if new insert fails, alert but
  do not roll back the old insert (old is canonical during dual-write).
- Reconciliation key: `(job_id, storage_path)` is unique per asset.

## Rollback

```bash
CUTOVER_VIDEO_LIBRARY=rolled-back
VITE_CUTOVER_VIDEO_LIBRARY=rolled-back
```

Smoke test:
```bash
curl -fsS -H "Authorization: Bearer $TOKEN" \
  https://<project-ref>.supabase.co/functions/v1/video-library/list | jq '.items | length'
```

## RLS notes

Existing policies kept as-is:
- `videos: users select own` — `(user_id = auth.uid()) AND (deleted_at IS NULL)`
- `videos: admins select all`

No new policy is required for cutover.
