بررسی خواندنی انجام شد. نتیجه فعلی: بک‌اند سالم است، اما پیام `TIMEOUT: The request took too long` از تایم‌اوت کلاینت در مسیر `jobs-create` می‌آید. در لاگ‌های اخیر job جدیدی ثبت نشده و عمدتاً فقط pollingهای `getJob` دیده می‌شود؛ بنابراین باید مسیر ساخت job را idempotent، قابل بازیابی و مستقل از اجرای background کنیم، نه فقط پیام خطا را عوض کنیم.

## Plan

1. **Make job creation idempotent and recoverable**
   - Add a safe `client_request_id` to generation jobs.
   - The frontend will generate this ID once per submit.
   - If the first request times out, retry/recovery with the same ID returns the same job instead of charging twice or creating duplicates.

2. **Move all create metadata into one atomic backend operation**
   - Replace the current `create job → update metadata` two-step with one safe database function that:
     - checks quota/credits,
     - debits credits once,
     - creates the Pending job,
     - stores frame URLs, duration, ratio, references, narration, draft group, and client request ID together.
   - Keep credit ledger protected behind backend/database functions; no direct client credit writes.

3. **Add a durable provider-start claim**
   - Add provider-start tracking fields such as claimed/attempt count.
   - Only one backend worker/poll request can claim a job for provider start at a time.
   - This prevents duplicate provider calls if the browser retries or polling overlaps.

4. **Self-healing provider startup**
   - Keep `EdgeRuntime.waitUntil` for fast background start.
   - Add a fallback in `jobs-get`: if a job is still Pending/Processing without a provider job ID and the start claim is missing/stale, polling safely re-dispatches provider start.
   - This fixes the root case where background work is dropped, killed, or delayed after `jobs-create` returns.

5. **Frontend timeout recovery**
   - Update `jobOrchestratorGateway.createJob` to send `clientRequestId`.
   - On `TIMEOUT`, automatically retry/resolve the same request once instead of leaving the composer with only an error.
   - If a job was created, immediately show it in Pending and continue polling.
   - Only show an error if recovery confirms no job exists.

6. **Clean user-facing errors safely**
   - Keep provider/API details sanitized.
   - Replace ambiguous timeout text with a recoverable status message like “Generation was queued; checking Pending…” while recovery runs.

7. **Tests and validation**
   - Add/adjust tests for:
     - duplicate `clientRequestId` does not double-charge,
     - timed-out create can recover the job,
     - provider-start claim prevents duplicate provider starts,
     - `jobs-get` can re-dispatch stuck Pending jobs.
   - Validate with typecheck and targeted function tests.
   - Deploy the impacted backend functions after implementation.

## Files expected to change

- `supabase/migrations/...` — add safe idempotency/claim fields and RPCs.
- `supabase/functions/_shared/modules/job-orchestrator/service.ts`
- `supabase/functions/_shared/modules/job-orchestrator/contract.ts`
- `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`
- `src/modules/job-orchestrator/contract.ts`
- `src/modules/job-orchestrator/gateway.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx`
- Existing/new targeted tests.

## Safety notes

- No provider keys or secrets will be exposed.
- No direct credit ledger manipulation from the frontend.
- Existing completed jobs remain untouched.
- The fix is backward-compatible for any older jobs without `client_request_id`.