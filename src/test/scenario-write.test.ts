import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../supabase/functions/scenario-write/prompt.ts";

describe("buildSystemPrompt - narration control", () => {
  const productAdWithCharacter = {
    productName: "Test Product",
    productDescription: "A great product",
    characterImageUrl: "https://example.com/character.jpg",
    characterDescription: "A friendly spokesperson",
  };

  it("product-ad with character + narration=true includes speaking instruction", () => {
    const prompt = buildSystemPrompt(15, productAdWithCharacter, false, undefined, undefined, "en", true);
    expect(prompt).toContain("SPOKESPERSON/PRESENTER");
    expect(prompt).toContain("SPEAK directly");
    expect(prompt).toContain("character-only shots");
    expect(prompt).toContain("without the product being visible or held");
  });

  it("product-ad with character + narration=false keeps character SILENT", () => {
    const prompt = buildSystemPrompt(15, productAdWithCharacter, false, undefined, undefined, "en", false);
    // Character should still be featured
    expect(prompt).toContain("recurring human character");
    expect(prompt).toContain("Use the character only in CHARACTER-ONLY shots");
    // But must NOT speak
    expect(prompt).toContain("must remain SILENT");
    expect(prompt).toContain("no spoken words");
    expect(prompt).toContain("dialogue");
    expect(prompt).toContain("voiceover");
    expect(prompt).toContain("without adding the product to those shots");
    // Should NOT contain speaking instructions
    expect(prompt).not.toContain("SPOKESPERSON/PRESENTER who SPEAKS");
    expect(prompt).not.toContain("must talk and verbally promote");
    expect(prompt).not.toContain("Include the character's spoken lines");
  });

  it.each(["scene", "plan", "film"] as const)(
    "enforces absolute character/product separation in %s mode",
    (unit) => {
      const prompt = buildSystemPrompt(
        30,
        productAdWithCharacter,
        false,
        undefined,
        undefined,
        "en",
        true,
        unit,
      );

      expect(prompt).toContain("HARD INVARIANT — STRICT CHARACTER/PRODUCT SHOT SEPARATION");
      expect(prompt).toContain("PARALLEL MONTAGE");
      expect(prompt).toContain("strictly CHARACTER-ONLY shots");
      expect(prompt).toContain("strictly PRODUCT-ONLY HERO SHOTS");
      expect(prompt).toContain("must NEVER appear in the same frame, panel, shot, scene beat, or composition");
      expect(prompt).toContain('"holding the product"');
      expect(prompt).toContain('"sliding the product"');
      expect(prompt).toContain('"placing the product"');
      expect(prompt).toContain('"touching the product"');
      expect(prompt).toContain("Hands must never be attached to or reach toward the product");
      expect(prompt).toContain("even if the user's brief requests it");
      expect(prompt).toContain("with no character, person, or human hands visible");
      expect(prompt).not.toContain("unless the user's brief explicitly requires");
      expect(prompt).not.toContain("by default");
    },
  );

  it("narration=false includes no-narration format instruction", () => {
    const prompt = buildSystemPrompt(15, productAdWithCharacter, false, undefined, undefined, "en", false);
    expect(prompt).toContain("Do NOT include any narration");
    expect(prompt).toContain("voiceover");
    expect(prompt).toContain("spoken dialogue");
    expect(prompt).toContain("No spoken words at all");
  });

  it("character-sheet mode preserves character identity regardless of narration", () => {
    const characterSheet = {
      characterName: "John Doe",
      characterDescription: "A brave hero",
      cameraStyle: "cinematic",
    };
    const promptWithNarration = buildSystemPrompt(15, undefined, false, characterSheet, undefined, "en", true);
    const promptWithoutNarration = buildSystemPrompt(15, undefined, false, characterSheet, undefined, "en", false);

    // Both should preserve character identity
    expect(promptWithNarration).toContain("John Doe");
    expect(promptWithoutNarration).toContain("John Doe");
    expect(promptWithNarration).toContain("lead character");
    expect(promptWithoutNarration).toContain("lead character");
  });

  it("auto-from-image mode works with both narration states", () => {
    const promptWith = buildSystemPrompt(15, undefined, true, undefined, undefined, "en", true);
    const promptWithout = buildSystemPrompt(15, undefined, true, undefined, undefined, "en", false);

    // Both should analyze the image
    expect(promptWith).toContain("analyze the attached image");
    expect(promptWithout).toContain("analyze the attached image");
    // Without narration should have no-spoken-words instruction
    expect(promptWithout).toContain("No spoken words at all");
  });

  it("preserves user prompt as primary story source", () => {
    const prompt = buildSystemPrompt(15, productAdWithCharacter, false, undefined, "User's business context", "en", true);
    expect(prompt).toContain("Business context");
    expect(prompt).toContain("User's business context");
  });

  it("5s duration has appropriate word cap and beat guidance", () => {
    const prompt = buildSystemPrompt(5, productAdWithCharacter, false, undefined, undefined, "en", true);
    expect(prompt).toContain("Use exactly 1 continuous timed visual beat: 0-5s");
    expect(prompt).toContain("Write 25-40 words total");
  });

  it("30s plan mode requests exactly six 5-second plans", () => {
    const prompt = buildSystemPrompt(30, productAdWithCharacter, false, undefined, undefined, "en", true, "plan");

    expect(prompt).toContain("structured as SIX sequential 5-second plans");
    expect(prompt).toContain("Output EXACTLY 6 plan blocks");
    expect(prompt).toContain("wide → medium → close → wide → medium → close");
  });
});
