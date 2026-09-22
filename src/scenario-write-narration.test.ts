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

    expect(prompt).toContain("Use the character in CHARACTER-ONLY shots by default");
    expect(prompt).toContain("without adding the product to those shots");
    expect(prompt).toContain("Do NOT include any narration");
    expect(prompt).not.toMatch(/SPOKESPERSON|SPEAKS directly|must talk|spoken lines|narration\/dialogue/i);
  });

  it("preserves the spokesperson instruction without forcing product contact when narration is enabled", () => {
    const prompt = buildSystemPrompt(15, productWithCharacter, false, undefined, undefined, "en", true);

    expect(prompt).toContain("SPOKESPERSON/PRESENTER");
    expect(prompt).toContain("SPEAK directly");
    expect(prompt).toContain("character-only shots");
    expect(prompt).toContain("without the product being visible or held");
    expect(prompt).toContain("Narration:");
  });

  it("requires explicit per-plan shot modes and defaults interaction off", () => {
    const prompt = buildSystemPrompt(30, productWithCharacter, false, undefined, undefined, "en", true, "plan");

    expect(prompt).toContain("[SHOT: PRODUCT_ONLY]");
    expect(prompt).toContain("[SHOT: CHARACTER_ONLY]");
    expect(prompt).toContain("[SHOT: ENVIRONMENT_ONLY]");
    expect(prompt).toContain("[SHOT: INTERACTION]");
    expect(prompt).toContain("allowed only when the user's brief explicitly requires character-product interaction");
    expect(prompt).toContain("Never choose it by default");
    expect(prompt).toContain("no placement beside, against, attached to, touching, or interacting with unrelated structures or objects");
  });
});
