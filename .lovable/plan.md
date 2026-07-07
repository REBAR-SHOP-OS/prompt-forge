# Fix: "keeps erroring" when generating a video

## What's actually happening
- The signed-in account **radin@rebar.shop has 46,240 credits**, so the on-screen "Still queuing…" is **not** a credits problem (unlike an earlier session on a 0-credit account).
- The browser console shows the real failure: `createJob` → **TIMEOUT (408)** after 120s ("The request took too long").
- Today there is **no job row created at all** for this user, even though the same Wan image-to-video path completed successfully on 2026-07-03. So `jobs-create` hangs *before/at* the point where the job is inserted, then the client gives up.
- The `generator_start_job_v2` RPC takes a `pg_advisory_xact_lock` (keyed on user + clientRequestId) plus `FOR UPDATE` locks on the quota and profile rows. A stuck/slow transaction or a slow cold start on that path produces exactly this symptom. No locks are stuck *right now*, so it is intermittent and must be reproduced live to confirm the exact stall point.

## Plan

### 1. Reproduce live (get the real error)
- Call the deployed `jobs-create` function directly as the signed-in user with a minimal valid payload (provider `wan`, a short prompt, a valid own `firstFrameUrl`), measuring latency.
- Confirm whether it returns `202` quickly, returns an error code, or hangs to the client timeout — and whether a job row appears.
- Check `jobs-create` edge logs and `pg_stat_activity`/`pg_locks` *during* the call to see if it blocks on the advisory/`FOR UPDATE` lock or on `resolveRoute`/provider handoff.

### 2. Root-cause and fix (targeted, non-destructive)
Depending on what step 1 shows, apply the matching root fix:
- **If it blocks on locks:** add a bounded `lock_timeout`/`statement_timeout` inside `generator_start_job_v2` so the RPC fails fast with a clean error instead of hanging 120s, and ensure the advisory lock scope is as narrow as possible. This turns an invisible hang into a fast, user-readable message.
- **If it blocks on provider handoff:** confirm the `202`-then-background pattern isn't being blocked (the code already uses `EdgeRuntime.waitUntil`); if a stray `await` is on the response path, move it into the background task.
- **If it's a cold-start/latency issue:** align the client `createJob` timeout and the retry/recovery-via-`jobs-list` logic so a slow-but-successful create is recovered instead of surfaced as an error.
- Keep all changes scoped to the generation start path; do not touch the credit ledger directly or alter RLS.

### 3. Deploy + verify end-to-end (repeat until it works)
- Redeploy the affected edge function / apply the migration.
- Re-run the direct `jobs-create` test → expect a fast `202` and a `pending` job row.
- Drive the actual UI (compose an image-to-video scene and submit) and confirm a card appears in the Pending/Working column and advances to `processing`, with no "Still queuing" error.
- If it still fails, iterate on the diagnosis and repeat until a job reliably starts.

## Technical notes
- Files/areas in scope: `supabase/functions/_shared/modules/job-orchestrator/gateway.ts` (createJob path), the `generator_start_job_v2` DB function (via migration), and possibly `src/modules/job-orchestrator/gateway.ts` (client timeout/recovery).
- Acceptance criteria: submitting a generation returns a job row within a few seconds and shows a Pending card that moves to Processing; no 120s client timeout; a clean error message in genuine failure cases instead of a silent hang.
- Testing note: reproduction/verification will create real jobs and spend a small amount of the signed-in account's credits (it has ample balance).

## Note on the branch/PR request
You earlier asked to route all changes through branch → PR → CI before editing in Lovable. This fix requires editing code and a DB migration in the Lovable editor and testing against the live backend. Confirm you want me to proceed directly here (given the urgency of "keeps erroring"), or whether I should instead hand you the exact patch to take through your PR workflow.
