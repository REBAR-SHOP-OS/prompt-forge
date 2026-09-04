interface ScenarioLeaseReleaseResult {
  error: { message?: string } | null;
}

type ReleaseScenarioLeaseRequest = () => PromiseLike<ScenarioLeaseReleaseResult>;
type LogReleaseError = (message: string, error: unknown) => void;

/**
 * Settle the PostgREST PromiseLike returned by supabase.rpc without assuming it
 * implements Promise.prototype.catch. Release failures are logged but never
 * replace the scenario response that the surrounding try block already built.
 */
export async function releaseScenarioLease(
  request: ReleaseScenarioLeaseRequest,
  logError: LogReleaseError = console.error,
): Promise<void> {
  try {
    const { error } = await request();
    if (error) logError("scenario-write lease release error", error.message ?? error);
  } catch (error) {
    logError("scenario-write lease release error", error);
  }
}
