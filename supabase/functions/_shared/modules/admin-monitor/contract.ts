// Admin Monitor — contract.
export interface HealthSummary {
  status: "ok";
  version: string;
  timestamp: string;
}

export interface AdminMonitor {
  getHealth(): HealthSummary;
}
