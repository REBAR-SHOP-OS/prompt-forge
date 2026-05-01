// Job-Orchestrator — frontend gateway (single grouped client for this domain).
//
// Public contract (v1, read-only stub in Phase 3 — no edge endpoint yet).
import type { JobSummary } from "./contract";

export const JOB_ORCHESTRATOR_CONTRACT_VERSION = "v1" as const;

export const jobOrchestratorGateway = {
  contractVersion: JOB_ORCHESTRATOR_CONTRACT_VERSION,
  listMyJobs: async (): Promise<JobSummary[]> => [],
};
