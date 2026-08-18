import { beforeEach, describe, expect, it, vi } from "vitest";

const queryResults = new Map<string, { data: unknown; error: { message: string } | null }>();
const operations: string[] = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      operations.push(`from:${table}`);
      return {
        select: () => {
          operations.push(`select:${table}`);
          return {
            eq: () => ({
              maybeSingle: async () => queryResults.get(table) ?? { data: null, error: null },
            }),
          };
        },
        insert: () => {
          throw new Error("get_credit_balance must remain SELECT-only");
        },
        update: () => {
          throw new Error("get_credit_balance must remain SELECT-only");
        },
        delete: () => {
          throw new Error("get_credit_balance must remain SELECT-only");
        },
      };
    },
  })),
}));

vi.mock("@lovable.dev/mcp-js", () => ({
  defineTool: (definition: unknown) => definition,
}));

import creditBalanceTool from "./get-credit-balance";

type TestTool = {
  annotations: { readOnlyHint: boolean };
  handler: (
    input: Record<string, never>,
    context: {
      isAuthenticated(): boolean;
      getUserId(): string;
      getToken(): string;
    },
  ) => Promise<{
    isError?: boolean;
    structuredContent?: {
      balance: { credits: number | null; status: string };
      quota: unknown;
      quotaStatus: string;
    };
  }>;
};

const tool = creditBalanceTool as unknown as TestTool;
const context = {
  isAuthenticated: () => true,
  getUserId: () => "user-1",
  getToken: () => "test-token",
};

describe("get_credit_balance", () => {
  beforeEach(() => {
    operations.length = 0;
    queryResults.clear();
  });

  it("returns wallet balance and initialized quota using SELECTs only", async () => {
    queryResults.set("core_user_profiles", {
      data: { credits_balance: 72 },
      error: null,
    });
    queryResults.set("billing_user_quotas", {
      data: {
        daily_limit_credits: 100,
        monthly_limit_credits: 1000,
        used_today: 12,
        used_this_month: 240,
        last_reset_day: "2026-08-18",
        last_reset_month: "2026-08-01",
      },
      error: null,
    });

    const result = await tool.handler({}, context);

    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(result.structuredContent).toMatchObject({
      balance: { credits: 72, status: "available" },
      quotaStatus: "initialized",
    });
    expect(operations).toEqual([
      "from:core_user_profiles",
      "select:core_user_profiles",
      "from:billing_user_quotas",
      "select:billing_user_quotas",
    ]);
  });

  it("reports an uninitialized quota without creating a row", async () => {
    queryResults.set("core_user_profiles", {
      data: { credits_balance: 18 },
      error: null,
    });
    queryResults.set("billing_user_quotas", { data: null, error: null });

    const result = await tool.handler({}, context);

    expect(result.structuredContent).toEqual({
      balance: { credits: 18, status: "available" },
      quota: null,
      quotaStatus: "not_initialized",
    });
    expect(operations.every((operation) => operation.startsWith("from:") || operation.startsWith("select:"))).toBe(true);
  });
});
