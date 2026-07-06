## Diagnosis (evidence-based)

What I checked:
- **No new job rows** were created today in `generator_generation_jobs` (latest is 2026-07-03), yet the AI-gateway logs show today's product-frame image edits **succeeding** (16:01–16:11). So the pre-submit steps work; the failure is at the `createJob` → `jobs-create` step.
- The active user (`radin@rebar.shop`) has **46,255 credits** — not a billing problem.
- Backend `jobs-create` (job-orchestrator gateway) runs **synchronously**: `resolveRoute → start_job RPC (debits credits) → external provider `startGeneration` (Wan/DashScope HTTP call) → complete/refund`. That outbound provider call can be slow, error, or hang.
- Frontend `src/core/api/client.ts` `request()` uses `fetch` with **no timeout / no AbortController**.

Conclusion:
- **First attempt "error"**: the Wan/DashScope `startGeneration` call returned/raised an error, surfaced by `handleSubmit`'s catch (and the server refunds the credit debit).
- **Second attempt "stuck on loading"**: the synchronous `jobs-create` request hung. Because `request()` has no timeout, the `fetch` never settles, so `isSubmitting` stays `true` forever and the composer's generate button spins indefinitely. `handleSubmit`'s `finally` can never run.

## Fix (safe, minimal, non-destructive)

Add a bounded client-side timeout so a hung/slow backend call can never freeze the UI again. No backend, schema, credit, or provider logic changes.

### 1. `src/core/api/client.ts`
- Add an optional `timeoutMs` to `request()` (extend the `init` options). When set, drive the `fetch` with an `AbortController` that aborts after `timeoutMs`; clear the timer in a `finally`.
- On abort, throw a clear `ApiError(408, "TIMEOUT", "The request took too long. Please try again.")` so existing catch/`finally` paths surface it and reset `isSubmitting`.
- Preserve the existing 401 refresh-and-retry flow (each attempt gets its own controller/timer). Calls that don't pass `timeoutMs` keep today's behavior unchanged (no regression for other endpoints).

### 2. `src/modules/job-orchestrator/gateway.ts`
- Pass a `timeoutMs` on the `createJob` request, chosen by provider so we don't cut off legitimately long work:
  - `wan` / `flow` (async task-start, returns quickly): ~120s.
  - `local` (self-hosted ComfyUI can run the full clip synchronously): a generous bound (~10 min) so real local generations still complete but can't hang forever.
- Optionally add a modest `timeoutMs` to `getJob`/`listMyJobs` (polling) so a stuck poll self-heals — the existing poll-failure/backoff logic already handles a thrown poll error and retries. (Kept conservative to avoid interfering with completion-time video re-hosting.)

## Why this is the right safe fix
- Guarantees the composer can never be permanently stuck loading — the spinner always resolves to success or a visible error, and the user can retry.
- Zero change to credit debit/refund, provider routing, or the DB — the server still refunds a failed/aborted debit as it does today.
- Minimal blast radius: only adds a timeout wrapper; endpoints that don't opt in are byte-for-byte unchanged.

## Follow-up (not in this change, optional)
The deeper architectural improvement is to make `jobs-create` return `202 Accepted` immediately and trigger the provider `startGeneration` in the background (`EdgeRuntime.waitUntil`) with the existing poller finishing the job. That removes the synchronous provider call entirely. Larger change — propose separately if you want it.

## Validation
- `tsgo --noEmit` clean.
- Simulate a slow/hung `jobs-create` (e.g., temporarily block the provider) and confirm the generate button stops spinning after the timeout with a clear error, and a retry works.
- Confirm a normal Wan I2V generation still starts and appears in the History/pending panel.