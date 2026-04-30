// Credit Management — contract.
export interface CreditApi {
  getBalance(): Promise<{ credits_balance: number; requestId?: string }>;
}
