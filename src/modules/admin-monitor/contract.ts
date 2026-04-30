// Admin Monitor — contract.
export interface HealthSummary {
  status: string;
  version: string;
  timestamp: string;
}

export interface AdminApi {
  getHealth(): Promise<HealthSummary>;
}
