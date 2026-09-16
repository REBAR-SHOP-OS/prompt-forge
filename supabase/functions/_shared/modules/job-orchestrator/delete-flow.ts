import type {
  GenerationCancelResult,
  ProviderKey,
} from "../external-api-adapter/contract.ts";
import type {
  JobDeleteCancellation,
  JobDeletePurge,
  JobDeleteResult,
} from "./contract.ts";

export interface DeletableJob {
  id: string;
  status: string;
  provider_key: string | null;
  provider_job_id?: string | null;
}

export interface DeleteFlowDependencies {
  cancel(
    providerKey: ProviderKey,
    providerJobId: string,
  ): Promise<GenerationCancelResult>;
  deleteLocal(): Promise<string[]>;
  purge(storagePaths: string[]): Promise<{ attempted: number; failed: number }>;
}

function cancellationFor(job: DeletableJob): JobDeleteCancellation | null {
  const active = job.status === "pending" || job.status === "processing";
  const provider = job.provider_key;
  if (
    !active || !job.provider_job_id ||
    (provider !== "flow" && provider !== "wan" && provider !== "local")
  ) {
    return {
      status: "not_needed",
      providerKey: provider,
      providerJobId: job.provider_job_id ?? null,
      message: null,
    };
  }
  return null;
}

/** Cancel the owned active provider job first, then delete local rows and purge owned files. */
export async function executeJobDeleteFlow(
  job: DeletableJob,
  deps: DeleteFlowDependencies,
): Promise<Omit<JobDeleteResult, "requestId">> {
  let cancellation = cancellationFor(job);
  if (!cancellation) {
    try {
      cancellation = await deps.cancel(
        job.provider_key as ProviderKey,
        job.provider_job_id as string,
      );
    } catch (error) {
      cancellation = {
        status: "failed",
        providerKey: job.provider_key,
        providerJobId: job.provider_job_id ?? null,
        message: error instanceof Error
          ? error.message
          : "Provider cancellation failed",
      };
    }
  }

  const storagePaths = await deps.deleteLocal();
  let purge: JobDeletePurge;
  if (storagePaths.length === 0) {
    purge = { status: "not_needed", attempted: 0, failed: 0 };
  } else {
    try {
      const result = await deps.purge(storagePaths);
      purge = {
        status: result.failed > 0 ? "partial" : "purged",
        attempted: result.attempted,
        failed: result.failed,
      };
    } catch {
      purge = {
        status: "partial",
        attempted: storagePaths.length,
        failed: storagePaths.length,
      };
    }
  }

  const warning = cancellation.status === "unsupported" ||
    cancellation.status === "failed" || purge.status === "partial";
  return {
    ok: true,
    outcome: warning ? "deleted_with_warnings" : "deleted",
    jobId: job.id,
    localDeleted: true,
    cancellation,
    purge,
  };
}
