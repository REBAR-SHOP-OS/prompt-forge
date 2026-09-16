import type { SupabaseClient } from "../_shared/core/supabase.ts";

export const MAX_AI_IMAGE_GENERATION_ATTEMPTS = 3;
export const MAX_AI_IMAGE_PROVIDER_CALLS = MAX_AI_IMAGE_GENERATION_ATTEMPTS * 2;
export const AI_IMAGE_DAILY_PROVIDER_CALL_LIMIT = 120;
// Reserve one product credit for every possible paid provider call. Settlement
// atomically refunds unused credits, so the final charge equals actual calls.
export const AI_IMAGE_PRODUCT_CREDIT_COST = MAX_AI_IMAGE_PROVIDER_CALLS;

export type AiImageClaimStatus =
  | "claimed"
  | "duplicate"
  | "insufficient_credits"
  | "quota_exceeded"
  | "profile_not_found";

export async function claimAiImageUsage(
  client: SupabaseClient,
  userId: string,
  requestId: string,
): Promise<AiImageClaimStatus> {
  const { data, error } = await client.rpc("claim_ai_image_request", {
    _user_id: userId,
    _request_id: requestId,
    _reserved_provider_calls: MAX_AI_IMAGE_PROVIDER_CALLS,
    _daily_provider_call_limit: AI_IMAGE_DAILY_PROVIDER_CALL_LIMIT,
    _credit_cost: AI_IMAGE_PRODUCT_CREDIT_COST,
  });
  if (error) throw new Error(error.message);
  return String(data) as AiImageClaimStatus;
}

export async function settleAiImageUsage(
  client: SupabaseClient,
  userId: string,
  requestId: string,
  consumedProviderCalls: number,
  succeeded: boolean,
): Promise<boolean> {
  const boundedCalls = Math.max(
    0,
    Math.min(MAX_AI_IMAGE_PROVIDER_CALLS, Math.floor(consumedProviderCalls)),
  );
  const { data, error } = await client.rpc("settle_ai_image_request", {
    _user_id: userId,
    _request_id: requestId,
    _consumed_provider_calls: boundedCalls,
    _succeeded: succeeded,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("AI image usage settlement was not applied");
  return true;
}
