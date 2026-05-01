# Domain cutover plan: job-orchestrator

**Cutover order: 5 of 6** (first domain with real user-write semantics.)

## Surface today

- Backend gateway: `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`
- Edge endpoint: not yet wired (planned Phase 5+; today the only operation is
  read-only `listMyJobs`, with no edge surface).
- Frontend gateway: `src/modules/job-orchestrator/gateway.ts` (stub returns `[]`)
- Tables read (RLS-enforced): `generator_generation_jobs`
- Tables written by users (RLS-enforced): INSERT and UPDATE on
  `generator_generation_jobs` (own rows, non-terminal status).

## Why fifth

- First write-bearing domain; needs the freeze-write machinery proven on
  external-api-adapter and video-library before going here.
- Must cut over before `credit-management`, since job creation is what
  consumes credits.

## Phases

| Phase         | Action                                                                                |
|---------------|---------------------------------------------------------------------------------------|
| `active`      | Current state. Default.                                                                |
| `dual-write`  | Job creation inserts into old + new. Status updates only on old (canonical).           |
| `shadow-read` | List payloads compared per JWT. Job-status transitions compared in audit log.          |
| `cutover`     | Frontend gateway switches; new is canonical for both insert and status updates.        |
| `frozen`      | Old endpoint returns `FROZEN` for INSERT/UPDATE for ~30s.                              |
| `rolled-back` | New endpoint refuses writes; status transitions resume on old.                         |

## Freeze-write plan

Critical because users may be mid-generation:
1. Set `CUTOVER_JOB_ORCHESTRATOR=frozen` on the OLD surface.
2. Wait for all in-flight jobs in `pending`/`running` to either finish or hit
   the worker timeout. Query:
   ```sql
   SELECT count(*) FROM generator_generation_jobs
   WHERE status IN ('pending','running')
     AND updated_at > now() - interval '10 minutes';
   ```
3. When count reaches 0 (or operator decides to abandon stragglers — they will
   be retried on the new surface), set `CUTOVER_JOB_ORCHESTRATOR=cutover` on
   the new surface.
4. Maximum acceptable freeze window: 5 minutes. If exceeded, abort and revert
   to `active` on the old surface.

## Dual-write plan

- Window: up to 1 hour (jobs are short-lived).
- INSERT-side: write to both surfaces with the SAME `id` (frontend generates
  UUID v4 client-side and includes it in the request). Conflict on PK is the
  reconciliation signal — if new insert fails on conflict but old succeeded,
  alert but don't fail the user.
- UPDATE-side (status transitions): single canonical owner during dual-write
  is the **old** surface. The new surface in `dual-write` only accepts
  inserts, not status changes, to avoid split-brain on `status`.

## Rollback

```bash
CUTOVER_JOB_ORCHESTRATOR=rolled-back
VITE_CUTOVER_JOB_ORCHESTRATOR=rolled-back
```

Smoke test:
```bash
# List should still respond after rollback
curl -fsS -H "Authorization: Bearer $TOKEN" \
  https://<project-ref>.supabase.co/functions/v1/jobs/list | jq '.items | length'
```

Reconciliation queries:
```sql
-- Jobs created on new surface only during dual-write window
SELECT id FROM generator_generation_jobs
WHERE created_at > '<window_start>' AND created_at < '<window_end>';
-- Cross-reference against old-surface insert log to find divergence.
```

## RLS notes

Existing policies preserved exactly:
- `jobs: users select own`
- `jobs: users insert own` (`user_id = auth.uid()`)
- `jobs: users update own non-terminal` (status not in completed/failed/cancelled)
- `jobs: admins select all`

Cutover never alters these.
