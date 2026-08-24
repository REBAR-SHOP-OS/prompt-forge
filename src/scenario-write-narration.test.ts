import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../supabase/functions/_shared/core/http.ts", () => ({
  corsHeaders: {},
}));
vi.mock("../supabase/functions/_shared/core/auth.ts", () => ({
  authenticate: vi.fn(),
}));
vi.mock("../supabase/functions/_shared/core/safe-json.ts", () => ({
  readJsonLoose: vi.fn(),
}));
vi.mock("../supabase/functions/_shared/core/supabase.ts", () => ({
  getServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
      insert: vi.fn(async () => ({ error: null })),
    })),
  })),
}));

let buildSystemPrompt: typeof import("../supabase/functions/scenario-write/index.ts").buildSystemPrompt;

beforeAll(async () => {
  Object.assign(globalThis, {
    Deno: {
      serve: vi.fn(),
      env: { get: vi.fn() },
    },
  });
  ({ buildSystemPrompt } = await import("../supabase/functions/scenario-write/index.ts"));
});

describe("scenario-write narration policy", () => {
  const productWithCharacter = {
    productName: "AeroPress",
    productDescription: "Portable coffee maker",
    characterImageUrl: "https://example.com/character.png",
  };

  it("keeps a product-ad character silent when narration is disabled", () => {
    const prompt = buildSystemPrompt(15, productWithCharacter, false, undefined, undefined, "en", false);

    expect(prompt).toContain("interacting silently with the product");
    expect(prompt).toContain("visible actions, expressions, staging");
    expect(prompt).toContain("Do NOT include any narration");
    expect(prompt).not.toMatch(/SPOKESPERSON|SPEAKS directly|must talk|spoken lines|narration\/dialogue/i);
  });

  it("preserves the spokesperson instruction when narration is enabled", () => {
    const prompt = buildSystemPrompt(15, productWithCharacter, false, undefined, undefined, "en", true);

    expect(prompt).toContain("SPOKESPERSON/PRESENTER");
    expect(prompt).toContain("SPEAKS directly");
    expect(prompt).toContain("Narration:");
  });
});
