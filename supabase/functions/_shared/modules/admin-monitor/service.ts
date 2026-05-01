// Admin Monitor — service implementation.
import type { AdminMonitor, HealthSummary } from "./contract.ts";
import { snapshotPhases } from "../../core/cutover.ts";

const VERSION = "0.4.0-modular";

export const adminMonitor: AdminMonitor = {
  getHealth(): HealthSummary {
    return {
      status: "ok",
      version: VERSION,
      timestamp: new Date().toISOString(),
      cutover: snapshotPhases(),
    };
  },
};
