import type { SupabaseClient } from "../../core/supabase.ts";

export interface VeoExtensionClaimStore {
  claim(
    expectedProviderJobId: string,
    claimedProviderJobId: string,
  ): Promise<boolean>;
  settle(
    claimedProviderJobId: string,
    nextProviderJobId: string,
    lastError: string | null,
  ): Promise<boolean>;
}

export class ConfirmedVeoExtensionDispatchError extends Error {
  readonly confirmed = true;
}

export type VeoExtensionDispatchResult<T> =
  | { status: "lost" }
  | { status: "dispatched"; value: T; providerJobId: string }
  | { status: "retryable"; error: string; providerJobId: string }
  | { status: "ambiguous"; error: string; providerJobId: string }
  | { status: "persist_failed"; error: string; providerJobId: string };

export interface DispatchPersistedVeoExtensionInput<T> {
  store: VeoExtensionClaimStore;
  expectedProviderJobId: string;
  claimedProviderJobId: string;
  dispatch(): Promise<{ value: T; providerJobId: string }>;
  retryProviderJobId(error: Error): string;
  isConfirmedFailure(error: unknown): boolean;
}

/**
 * Claims durable provider state before the paid extension request. Only the
 * CAS winner may dispatch. A confirmed provider rejection is moved to an
 * explicit retry state; ambiguous transport/crash outcomes retain the claim so
 * a later poll cannot accidentally purchase the same extension again.
 */
export async function dispatchPersistedVeoExtension<T>(
  input: DispatchPersistedVeoExtensionInput<T>,
): Promise<VeoExtensionDispatchResult<T>> {
  const won = await input.store.claim(
    input.expectedProviderJobId,
    input.claimedProviderJobId,
  );
  if (!won) return { status: "lost" };

  try {
    const dispatched = await input.dispatch();
    const settled = await input.store.settle(
      input.claimedProviderJobId,
      dispatched.providerJobId,
      null,
    );
    if (!settled) {
      return {
        status: "persist_failed",
        error:
          "Provider accepted the extension but its operation could not be persisted",
        providerJobId: input.claimedProviderJobId,
      };
    }
    return {
      status: "dispatched",
      value: dispatched.value,
      providerJobId: dispatched.providerJobId,
    };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    if (!input.isConfirmedFailure(cause)) {
      return {
        status: "ambiguous",
        error: error.message,
        providerJobId: input.claimedProviderJobId,
      };
    }

    const retryProviderJobId = input.retryProviderJobId(error);
    const released = await input.store.settle(
      input.claimedProviderJobId,
      retryProviderJobId,
      error.message,
    );
    if (!released) {
      return {
        status: "persist_failed",
        error: error.message,
        providerJobId: input.claimedProviderJobId,
      };
    }
    return {
      status: "retryable",
      error: error.message,
      providerJobId: retryProviderJobId,
    };
  }
}

export function createVeoExtensionClaimStore(
  client: SupabaseClient,
  userId: string,
  jobId: string,
): VeoExtensionClaimStore {
  return {
    async claim(expectedProviderJobId, claimedProviderJobId) {
      const { data, error } = await client.rpc(
        "generator_claim_veo_extension",
        {
          _user_id: userId,
          _job_id: jobId,
          _expected_provider_job_id: expectedProviderJobId,
          _claimed_provider_job_id: claimedProviderJobId,
        },
      );
      if (error) throw new Error(error.message);
      return Boolean(data);
    },

    async settle(claimedProviderJobId, nextProviderJobId, lastError) {
      const { data, error } = await client.rpc(
        "generator_settle_veo_extension",
        {
          _user_id: userId,
          _job_id: jobId,
          _claimed_provider_job_id: claimedProviderJobId,
          _next_provider_job_id: nextProviderJobId,
          _last_error: lastError,
        },
      );
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
  };
}
