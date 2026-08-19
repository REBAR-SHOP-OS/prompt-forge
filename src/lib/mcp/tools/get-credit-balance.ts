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
    "Get the signed-in user's wallet credit balance and, when initialized, daily and monthly quota limits and usage.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    
    const userId = ctx.getUserId();
    const client = supabaseForUser(ctx);
    
    const [profileResult, quotaResult] = await Promise.all([
      client
        .from("core_user_profiles")
        .select("credits_balance")
        .eq("id", userId)
        .maybeSingle(),
      client
        .from("billing_user_quotas")
        .select("daily_limit_credits, monthly_limit_credits, used_today, used_this_month, last_reset_day, last_reset_month")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      return { content: [{ type: "text", text: profileResult.error.message }], isError: true };
    }
    if (quotaResult.error) {
      return { content: [{ type: "text", text: quotaResult.error.message }], isError: true };
    }

    const summary = {
      balance: {
        credits: profileResult.data?.credits_balance ?? null,
        status: profileResult.data ? "available" : "profile_not_found",
      },
      quota: quotaResult.data,
      quotaStatus: quotaResult.data ? "initialized" : "not_initialized",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: summary,
    };
  },
});
