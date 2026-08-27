import { describe, it, expect, vi } from "vitest";

// Provide Deno globals so the edge function can be imported in Node/Vitest.
Object.assign(globalThis, {
  Deno: {
    serve: vi.fn(() => ({})),
    env: { get: vi.fn() },
  },
});

vi.mock("../../supabase/functions/_shared/core/http.ts", () => ({
  corsHeaders: {},
}));

vi.mock("../../supabase/functions/_shared/core/auth.ts", () => ({
  authenticate: vi.fn(),
}));

const { buildSystemPrompt } = await import(
  "../../supabase/functions/scenario-write/index.ts"
);

const FORBIDDEN_SPEAK_PATTERNS = [
  /SPEAKS directly/i,
  /SPOKESPERSON/i,
  /PRESENTER/i,
  /must talk/i,
  /spoken lines/i,
  /narration\/dialogue/i,
  /voiceover line that promotes/i,
  /lead character's spoken dialogue/i,
  /on-screen character's spoken dialogue that promotes the product/i,
];

function hasForbiddenSpeech(prompt: string): boolean {
  return FORBIDDEN_SPEAK_PATTERNS.some((re) => re.test(prompt));
}

describe("buildSystemPrompt", () => {
  describe("product-ad with character image", () => {
    it("must NOT instruct the character to speak when narration is false", () => {
      const prompt = buildSystemPrompt(
        5,
        {
          productName: "AeroPress",
          productDescription: "Portable coffee maker.",
          characterImageUrl: "https://x.com/char.png",
          characterDescription: "A friendly barista.",
        },
        false,
        undefined,
        undefined,
        "en",
        false,
      );
      expect(prompt).toContain("AeroPress");
      expect(prompt).toContain("character provided as a SECOND attached image");
      expect(prompt).toContain("friendly barista");
      expect(prompt).toContain("Do NOT include any narration");
      expect(prompt).not.toContain("SPOKESPERSON");
      expect(prompt).not.toContain("SPEAKS directly");
      expect(prompt).not.toContain("must talk");
      expect(prompt).toMatch(/Do NOT include any narration[\s\S]*Narration:/);
      expect(hasForbiddenSpeech(prompt)).toBe(false);
    });

    it("keeps the speaking instruction when narration is true", () => {
      const prompt = buildSystemPrompt(
        5,
        {
          productName: "AeroPress",
          productDescription: "Portable coffee maker.",
          characterImageUrl: "https://x.com/char.png",
          characterDescription: "A friendly barista.",
        },
        false,
        undefined,
        undefined,
        "en",
        true,
      );
      expect(prompt).toContain("AeroPress");
      expect(prompt).toContain("character provided as a SECOND attached image");
      expect(prompt).toContain("SPOKESPERSON");
      expect(prompt).toContain("SPEAKS directly");
      expect(prompt).toContain("Narration:");
    });
  });

  describe("character-sheet mode", () => {
    it("produces no spoken words when narration is false", () => {
      const prompt = buildSystemPrompt(
        5,
        undefined,
        false,
        {
          characterName: "Mira",
          characterDescription: "A determined cyclist.",
        },
        undefined,
        "en",
        false,
      );
      expect(prompt).toContain("Mira");
      expect(prompt).toContain("determined cyclist");
      expect(prompt).toContain("Do NOT include any narration");
      expect(prompt).toMatch(/Do NOT include any narration[\s\S]*Narration:/);
      expect(hasForbiddenSpeech(prompt)).toBe(false);
    });

    it("allows lead character dialogue when narration is true", () => {
      const prompt = buildSystemPrompt(
        5,
        undefined,
        false,
        {
          characterName: "Mira",
          characterDescription: "A determined cyclist.",
        },
        undefined,
        "en",
        true,
      );
      expect(prompt).toContain("Mira");
      expect(prompt).toContain("Narration:");
      expect(prompt).toContain("lead character's spoken dialogue");
    });
  });

  describe("plain product-ad mode (no character image)", () => {
    it("produces no spoken words when narration is false", () => {
      const prompt = buildSystemPrompt(
        5,
        {
          productName: "Sparkle Water",
          productDescription: "Sparkling mineral water.",
        },
        false,
        undefined,
        undefined,
        "en",
        false,
      );
      expect(prompt).toContain("Sparkle Water");
      expect(prompt).toContain("Do NOT include any narration");
      expect(prompt).toMatch(/Do NOT include any narration[\s\S]*Narration:/);
      expect(hasForbiddenSpeech(prompt)).toBe(false);
    });

    it("keeps the voiceover line when narration is true", () => {
      const prompt = buildSystemPrompt(
        5,
        {
          productName: "Sparkle Water",
          productDescription: "Sparkling mineral water.",
        },
        false,
        undefined,
        undefined,
        "en",
        true,
      );
      expect(prompt).toContain("Sparkle Water");
      expect(prompt).toContain("Narration:");
      expect(prompt).toContain("voiceover line that promotes the product");
    });
  });

  describe("auto-from-image mode", () => {
    it("produces no spoken words when narration is false", () => {
      const prompt = buildSystemPrompt(
        5,
        undefined,
        true,
        undefined,
        undefined,
        "en",
        false,
      );
      expect(prompt).toContain("analyze the attached image");
      expect(prompt).toContain("Do NOT include any narration");
      expect(prompt).toMatch(/Do NOT include any narration[\s\S]*Narration:/);
      expect(hasForbiddenSpeech(prompt)).toBe(false);
    });

    it("keeps narration when narration is true", () => {
      const prompt = buildSystemPrompt(
        5,
        undefined,
        true,
        undefined,
        undefined,
        "en",
        true,
      );
      expect(prompt).toContain("analyze the attached image");
      expect(prompt).toContain("Narration:");
    });
  });

  describe("payload fidelity", () => {
    it("preserves the user's prompt, business info, product name, and character name", () => {
      const prompt = buildSystemPrompt(
        15,
        {
          productName: "Rebar Clamp",
          productDescription: "Heavy-duty clamp.",
          characterImageUrl: "https://x.com/char.png",
        },
        false,
        undefined,
        "Industrial hardware supplier",
        "en",
        false,
      );
      expect(prompt).toContain("Heavy-duty clamp");
      expect(prompt).toContain("Industrial hardware supplier");
      expect(prompt).toContain("Rebar Clamp");
      expect(prompt).toContain("character provided as a SECOND attached image");
    });
  });

  describe("duration budget", () => {
    it("keeps a 5s scenario under the 40-word output cap and repeats no forbidden narration", () => {
      const prompt = buildSystemPrompt(
        5,
        {
          productName: "Mini Fan",
          productDescription: "USB desk fan.",
          characterImageUrl: "https://x.com/char.png",
        },
        false,
        undefined,
        undefined,
        "en",
        false,
      );
      expect(prompt).toContain("Keep it under 40 words");
      expect(prompt).toContain("5s = 1 beat");
      expect(prompt).toContain("Do NOT include any narration");
      expect(hasForbiddenSpeech(prompt)).toBe(false);
    });
  });
});
