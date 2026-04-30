// Admin Monitor — service implementation.
import type { AdminMonitor, HealthSummary } from "./contract.ts";

const VERSION = "0.2.0-modular";

export const adminMonitor: AdminMonitor = {
  getHealth(): HealthSummary {
    return { status: "ok", version: VERSION, timestamp: new Date().toISOString() };
  },
};
