# Root-cause fix for the new Veo failure

## What I found

The latest failed job did **not** fail from the previous `inlineData` payload bug. The provider operation started successfully:

```text
models/veo-3.1-generate-preview/operations/8effyrezoxxq
```

Polling that operation returns:

```text
This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
```

So the new root cause is a provider-side transient failure (`code 14` / high demand). Our backend currently treats that terminal provider response as a permanent failed job immediately.

I also found a second structural problem in the 10s/15s Veo implementation: extension state is stored only in memory (`Map`s). Edge functions can restart between create and poll, so for long clips the backend may forget that a job needs extension and incorrectly finalize/handle only the base 8s phase.

## Implementation plan

### 1. Make Veo transient errors retryable

Update `pollVeo` so provider errors like high-demand / unavailable / temporary capacity are not immediately marked `failed`.

Instead:
- keep job `processing`
- return a progress estimate
- log a structured retryable-provider message
- allow the next UI poll to retry the same provider operation

This prevents temporary Veo capacity spikes from killing the user job.

### 2. Persist enough Veo state in `provider_job_id`

Replace the fragile in-memory-only long-video tracking with a durable encoded provider job id, for example:

```text
veo:v1:<base64url-json>
```

The encoded state will include:
- initial operation name
- current operation name
- requested target duration
- prompt
- aspect ratio
- model
- whether extension has started
- phase started time

This keeps 10s/15s jobs reliable even if the edge function restarts between polling calls.

### 3. Let polling update the provider job id when extension starts

When phase 1 succeeds and the extension operation starts, `pollVeo` will return the updated encoded provider state.

`job-orchestrator/gateway.ts` will persist that updated provider id before returning the processing status, so the next poll continues from the extension operation instead of losing state.

### 4. Refund credits only on real permanent failures

For provider terminal failures that are truly permanent, use the existing `generator_fail_job` path instead of a direct status update, so credits are refunded consistently.

High-demand/transient Veo errors will not fail/refund immediately because the job remains retryable.

## Files to change

- `supabase/functions/_shared/modules/external-api-adapter/contract.ts`
  - add optional `providerJobId` to poll results

- `supabase/functions/_shared/modules/external-api-adapter/service.ts`
  - add durable Veo state encode/decode helpers
  - classify retryable Veo errors
  - remove reliance on in-memory extension maps for correctness
  - return updated provider job id when extension state changes

- `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`
  - persist updated provider job id during polling
  - use `jobService.failJob` on permanent provider failures

- `supabase/functions/_shared/modules/job-orchestrator/service.ts` / contract if needed
  - add a small method to update provider job id safely, or use the existing backend RPC if suitable

## Validation

- Re-check the failed operation path confirms the error is treated as retryable, not permanent failed.
- Verify no remaining Veo image/video payload uses `inlineData`.
- Deploy `jobs-create` and test polling behavior through the backend.
- Confirm 15s jobs keep extension state durably across polls/restarts.
