import { request } from "@/core/api/client";
import type { CreditApi } from "./contract";

export const creditApi: CreditApi = {
  getBalance: () => request<{ credits_balance: number; requestId?: string }>("/usage-credits"),
};
