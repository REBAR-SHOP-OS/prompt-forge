// Credit Management — contract.
import type { SupabaseClient } from "../../core/supabase.ts";

export interface CreditService {
  /** RLS-enforced read of the caller's balance. `client` must be user-scoped. */
  getBalance(userId: string, client: SupabaseClient): Promise<number | null>;
}
