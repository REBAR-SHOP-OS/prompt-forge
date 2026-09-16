import {
  AI_IMAGE_DAILY_PROVIDER_CALL_LIMIT,
  AI_IMAGE_PRODUCT_CREDIT_COST,
  MAX_AI_IMAGE_GENERATION_ATTEMPTS,
  MAX_AI_IMAGE_PROVIDER_CALLS,
  claimAiImageUsage,
  settleAiImageUsage,
} from "./usage.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("AI image accounting reserves all generation and identity-evaluation calls", async () => {
  assert(MAX_AI_IMAGE_GENERATION_ATTEMPTS === 3, "generation attempts changed");
  assert(MAX_AI_IMAGE_PROVIDER_CALLS === 6, "three generation plus three evaluation calls were not reserved");
  assert(AI_IMAGE_PRODUCT_CREDIT_COST === 6, "one credit per paid provider call was not reserved");

  let claimArgs: Record<string, unknown> | undefined;
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      assert(name === "claim_ai_image_request", "wrong claim RPC");
      claimArgs = args;
      return Promise.resolve({ data: "claimed", error: null });
    },
  };

  const status = await claimAiImageUsage(
    client as never,
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  );

  assert(status === "claimed", "claim status changed");
  assert(claimArgs?._reserved_provider_calls === 6, "claim did not reserve the bounded worst case");
  assert(claimArgs?._daily_provider_call_limit === AI_IMAGE_DAILY_PROVIDER_CALL_LIMIT, "daily quota omitted");
  assert(claimArgs?._credit_cost === AI_IMAGE_PRODUCT_CREDIT_COST, "product credit cost omitted");
});

Deno.test("AI image settlement clamps observed provider calls to the reserved maximum", async () => {
  let settleArgs: Record<string, unknown> | undefined;
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      assert(name === "settle_ai_image_request", "wrong settle RPC");
      settleArgs = args;
      return Promise.resolve({ data: true, error: null });
    },
  };

  const settled = await settleAiImageUsage(
    client as never,
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    99,
    false,
  );

  assert(settled, "settlement result changed");
  assert(settleArgs?._consumed_provider_calls === 6, "settlement exceeded the reservation");
  assert(settleArgs?._succeeded === false, "failed outcome was not recorded");
});

Deno.test("AI image settlement surfaces a rejected or missing ledger row", async () => {
  const client = {
    rpc() {
      return Promise.resolve({ data: false, error: null });
    },
  };

  let rejected = false;
  try {
    await settleAiImageUsage(
      client as never,
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      1,
      true,
    );
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("was not applied");
  }
  assert(rejected, "missing settlement was silently accepted");
});
