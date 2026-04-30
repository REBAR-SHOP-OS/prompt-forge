// Credit Management — service implementation.
import type { SupabaseClient } from "../../core/supabase.ts";
import type { CreditService } from "./contract.ts";

export const creditService: CreditService = {
  async getBalance(userId, client) {
    const { data, error } = await client
      .from("core_user_profiles")
      .select("credits_balance")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(`credits lookup failed: ${error.message}`);
    return data?.credits_balance ?? null;
  },
};
