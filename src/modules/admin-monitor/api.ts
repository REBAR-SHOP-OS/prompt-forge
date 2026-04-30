import { request } from "@/core/api/client";
import type { AdminApi, HealthSummary } from "./contract";

export const adminApi: AdminApi = {
  getHealth: () => request<HealthSummary>("/health"),
};
