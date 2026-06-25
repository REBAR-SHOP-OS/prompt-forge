# Fix: "Scene 1 failed; cannot chain remaining scenes"

## Root cause (confirmed via live provider query)
The Wan/DashScope task `38a0e30b-...` returned:
- `code: DataInspectionFailed`
- `message: Green net check failed for text (input): Input data may contain inappropriate content.`

The provider's content-moderation filter rejected the **prompt text** (brand names like
"ChatGPT" / sensitive wording). This is not a chaining bug — Scene 1 genuinely failed at
the provider, which correctly halts the chain. The problem is the UI showed only "Failed"
with no actionable reason, and credits handling/message were unclear.

## Plan
1. **`supabase/functions/_shared/modules/external-api-adapter/service.ts`** — in
   `pollWanI2V` FAILED/CANCELED branch, detect moderation codes
   (`DataInspectionFailed`, "green net", "inappropriate content") and return a clear,
   actionable English reason: ask the user to reword the prompt (avoid brand names / real
   people / sensitive wording) or change the start image. Pass through other provider
   messages unchanged.

2. (Optional, confirm with user) Frontend `DashboardPage.tsx`: when the failed reason is a
   moderation block, show the friendly message in the card/toast so it's obvious how to fix.

3. Redeploy `jobs-get` / affected functions and re-test.

## Notes
- Credits are already refunded on failure (existing `failJob(..., refundCredits: true)`).
- No change to chaining logic, auth, storage, or generation UI structure.
