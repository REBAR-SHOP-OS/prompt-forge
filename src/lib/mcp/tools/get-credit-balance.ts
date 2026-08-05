import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY)!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_credit_balance",
  title: "Get credit balance",
  description:
    "Get the signed-in user's credit quota: daily and monthly limits and how much has been used.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    
    const userId = ctx.getUserId();
    const client = supabaseForUser(ctx);
    
    // Try to get existing quota
    let { data, error } = await client
      .from("billing_user_quotas")
      .select("daily_limit_credits, monthly_limit_credits, used_today, used_this_month, last_reset_day, last_reset_month")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    
    // Auto-create quota row if missing (same logic as generator_start_job)
    if (!data) {
      const { data: newData, error: insertError } = await client
        .from("billing_user_quotas")
        .insert({ user_id: userId })
        .select("daily_limit_credits, monthly_limit_credits, used_today, used_this_month, last_reset_day, last_reset_month")
        .single();
      
      if (insertError) {
        // If insert failed due to race condition, try fetch again
        if (insertError.code === "23505") { // unique_violation
          const { data: retryData, error: retryError } = await client
            .from("billing_user_quotas")
            .select("daily_limit_credits, monthly_limit_credits, used_today, used_this_month, last_reset_day, last_reset_month")
            .eq("user_id", userId)
            .maybeSingle();
          if (retryError) return { content: [{ type: "text", text: retryError.message }], isError: true };
          data = retryData;
        } else {
          return { content: [{ type: "text", text: insertError.message }], isError: true };
        }
      } else {
        data = newData;
      }
    }
    
    if (!data)
      return { content: [{ type: "text", text: "Unable to retrieve quota for this user." }] };
    
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { quota: data },
    };
  },
});
