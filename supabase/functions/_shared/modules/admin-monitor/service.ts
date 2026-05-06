// Admin Monitor — service implementation.
import type { AdminMonitor, HealthSummary } from "./contract.ts";

export const adminMonitor: AdminMonitor = {
  getHealth(): HealthSummary {
    // Public endpoint — return only a minimal liveness signal. Internal
    // version + per-domain cutover phases are not exposed to unauthenticated
    // callers (would aid fingerprinting). Authenticated admin tooling can
    // expose those details through a separate gated endpoint if needed.
    return {
      status: "ok",
      version: "redacted",
      timestamp: new Date().toISOString(),
      cutover: {},
    };
  },
};
