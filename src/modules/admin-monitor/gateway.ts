// Admin-Monitor — frontend gateway (single grouped client for this domain).
//
// Public contract (v1):
//   - getHealth() -> HealthSummary
//
// All admin-monitor UI code MUST import from this file. Do not call /health
// directly via @/core/api/client from components.
import { request } from "@/core/api/client";
import type { HealthSummary } from "./contract";

export const ADMIN_MONITOR_CONTRACT_VERSION = "v1" as const;

export const adminMonitorGateway = {
  contractVersion: ADMIN_MONITOR_CONTRACT_VERSION,
  getHealth: () => request<HealthSummary>("/health"),
};
