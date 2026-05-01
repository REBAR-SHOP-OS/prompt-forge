// Credit-Management — frontend gateway (single grouped client for this domain).
//
// Public contract (v1):
//   - getMyBalance() -> { credits_balance, requestId? }
import { request } from "@/core/api/client";

export const CREDIT_MANAGEMENT_CONTRACT_VERSION = "v1" as const;

export interface CreditBalance {
  credits_balance: number;
  requestId?: string;
}

export const creditManagementGateway = {
  contractVersion: CREDIT_MANAGEMENT_CONTRACT_VERSION,
  getMyBalance: () => request<CreditBalance>("/usage-credits"),
};
