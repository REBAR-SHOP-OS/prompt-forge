// Admin Monitor — contract.
import type { CutoverPhase, DomainKey } from "../../core/cutover.ts";

export interface HealthSummary {
  status: "ok";
  version: string;
  timestamp: string;
  /** Optional: current cutover phase per domain. Additive — old clients ignore. */
  cutover?: Record<DomainKey, CutoverPhase>;
}

export interface AdminMonitor {
  getHealth(): HealthSummary;
}
