// Admin Monitor — service implementation.
// SECURITY: This endpoint is unauthenticated. Do NOT include version, build,
// migration topology, or any internal architecture detail in the response.
import type { AdminMonitor, HealthSummary } from "./contract.ts";

export const adminMonitor: AdminMonitor = {
  getHealth(): HealthSummary {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  },
};
