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
    expect(prompt).toContain("SPOKESPERSON/PRESENTER who SPEAKS");
    expect(prompt).toContain("must talk and verbally promote");
    expect(prompt).toContain("Include the character's spoken lines");
  });

  it("product-ad with character + narration=false keeps character SILENT", () => {
    const prompt = buildSystemPrompt(15, productAdWithCharacter, false, undefined, undefined, "en", false);
    // Character should still be featured
    expect(prompt).toContain("recurring human character");
    expect(prompt).toContain("feature this exact character on screen");
    // But must NOT speak
    expect(prompt).toContain("must remain SILENT");
    expect(prompt).toContain("no spoken words");
    expect(prompt).toContain("no dialogue");
    expect(prompt).toContain("no voiceover");
    // Should NOT contain speaking instructions
    expect(prompt).not.toContain("SPOKESPERSON/PRESENTER who SPEAKS");
    expect(prompt).not.toContain("must talk and verbally promote");
    expect(prompt).not.toContain("Include the character's spoken lines");
  });

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
    expect(prompt).toContain("5s = 1 beat");
    expect(prompt).toContain("one decisive shot");
  });
});
