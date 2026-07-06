## Expected outcome
Video generation should reliably create a visible Pending card, start the provider in the background, keep polling until completion/failure, and show a clear English status instead of timing out or leaving the user with no card.

## What I found
- The visible message comes from the frontend timeout path: `src/core/api/client.ts` aborts `/jobs-create` after 45 seconds and throws `TIMEOUT`.
- `/jobs-create` has already been partly moved to an async pattern, but the provider-start handoff is still fragile: if background execution is not retained correctly, the job can stay queued without a provider job id.
- The backend has recovery logic in `jobs-get`, but it needs to be hardened so stuck Pending jobs are re-claimed/re-dispatched instead of silently staying empty.
- Recent backend logs show `createJob` can return `202`, but the user-facing flow still reports no usable generated result, so the root fix must cover both creation timeout and post-create provider handoff.

## Implementation plan
1. **Harden `/jobs-create` backend dispatch**
   - Make provider start handoff explicitly observable with safe logs.
   - Ensure the function returns `202` only after the durable job exists and the provider-start claim is recorded.
   - Avoid unnecessary blocking after the job is created by parallelizing non-critical audit/request logging.

2. **Strengthen stuck-job recovery in `/jobs-get`**
   - If a job is still `pending` with no provider job id after the handoff window, re-claim and re-dispatch provider start.
   - If re-dispatch fails repeatedly, mark the job failed with a safe message and refund credits instead of leaving an invisible/stuck card.
   - Keep the status text in English and useful: queued, rendering, failed/refunded, ready.

3. **Fix frontend timeout behavior**
   - Increase the `/jobs-create` client timeout from 45s to a safer backend-compatible threshold.
   - Keep idempotent retry using the same `clientRequestId` so retries do not double-charge or duplicate jobs.
   - Ensure `TIMEOUT` renders as a clear English recovery message, not a raw technical error.

4. **Improve Pending visibility**
   - Make sure the returned job is immediately seeded into Pending as soon as `/jobs-create` returns `202`.
   - If creation times out but the request may have reached the backend, refresh/list jobs so an already-created job appears instead of telling the user to retry blindly.

5. **Validate end-to-end**
   - Check relevant Edge Function logs and database job rows after the change.
   - Deploy the changed functions.
   - Test the create → Pending → provider start/poll path and confirm no stuck Pending/no-card state.

## Constraints and safeguards
- No provider keys or secrets will be exposed or hardcoded.
- Credit ledger will not be edited directly; existing credit/job RPCs remain the authority.
- Changes stay minimal and focused on generation reliability, not visual redesign.
- Backend table access/RLS rules will only be changed if investigation during build confirms a permission issue.