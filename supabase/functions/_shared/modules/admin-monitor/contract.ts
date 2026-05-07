// Admin Monitor — contract.
// Public health probe — intentionally minimal to avoid leaking internal details.
export interface HealthSummary {
  status: "ok";
  timestamp: string;
}

export interface AdminMonitor {
  getHealth(): HealthSummary;
}
