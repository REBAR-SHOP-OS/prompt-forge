import { describe, expect, it, vi } from "vitest";
import {
  buildScenarioFingerprint,
  buildSemanticJudgePrompt,
  buildVariationInstruction,
  fingerprintSimilarity,
  normalizeText,
  parseSemanticJudgeResult,
  runAntiDuplicatePass,
  type ScenarioHistoryEntry,
} from "../supabase/functions/scenario-write/scenario-fingerprint.ts";

const PRODUCT_A = "product:prod-a";
const PRODUCT_B = "product:prod-b";

function scenario(prefix: string, camera: string, action: string, ending: string): string[] {
  return [
    `${prefix} opening: the hero product sits on a clean studio table as a ${camera} shot establishes the scene.`,
    `${prefix} middle: the camera ${action} to reveal the product's key feature in sharp detail.`,
    `${prefix} ending: ${ending}`,
  ];
}

function entry(scenes: string[], subjectCombo = PRODUCT_A): ScenarioHistoryEntry {
  return {
    fingerprint: buildScenarioFingerprint(scenes, subjectCombo),
    scenarioText: scenes.join("\n\n"),
  };
}

const coffee = () =>
  scenario("Coffee", "wide", "zoom", "the barista smiles and hands over the cup");
const steel = () =>
  scenario("Steel", "aerial", "pan", "the factory floor erupts in sparks as the beam is welded");

describe("normalizeText", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeText("  A Product, Film!  With  Extra   Spaces ")).toBe(
      "a product film with extra spaces",
    );
  });
});

describe("buildScenarioFingerprint", () => {
  it("captures opening, ending, concept, camera, and subject combo", () => {
    const fp = buildScenarioFingerprint(coffee(), PRODUCT_A);
    expect(fp.subjectCombo).toBe(PRODUCT_A);
    expect(fp.opening).toContain("coffee opening");
    expect(fp.ending).toContain("coffee ending");
    expect(fp.concept.length).toBeGreaterThan(0);
    expect(fp.camera).toContain("wide");
    expect(fp.camera).toContain("zoom");
  });

  it("accepts a single joined string with ===SCENE=== delimiters", () => {
    const joined = scenario("Tea", "pan", "tilt", "the cup steams").join(" ===SCENE=== ");
    const fp = buildScenarioFingerprint(joined, PRODUCT_A);
    expect(fp.opening).toContain("tea opening");
    expect(fp.ending).toContain("tea ending");
  });
});

describe("fingerprintSimilarity", () => {
  it("is identity-independent: a re-told story with a new product still scores high", () => {
    const a = buildScenarioFingerprint(coffee(), PRODUCT_A);
    const b = buildScenarioFingerprint(coffee(), PRODUCT_B);
    // Same story, different product identity — must still be a duplicate.
    expect(fingerprintSimilarity(a, b)).toBe(1);
  });

  it("returns 1 for identical scenarios", () => {
    const a = buildScenarioFingerprint(coffee(), PRODUCT_A);
    const b = buildScenarioFingerprint(coffee(), PRODUCT_A);
    expect(fingerprintSimilarity(a, b)).toBe(1);
  });

  it("returns a high score for a synonym-only variation (near/semantic duplicate)", () => {
    const a = buildScenarioFingerprint(coffee(), PRODUCT_A);
    const b = buildScenarioFingerprint(
      scenario("Coffee", "wide", "zoom", "the barista grins and passes the mug"),
      PRODUCT_A,
    );
    expect(fingerprintSimilarity(a, b)).toBeGreaterThanOrEqual(0.8);
  });

  it("returns a low score for a genuinely different film", () => {
    const a = buildScenarioFingerprint(coffee(), PRODUCT_A);
    const b = buildScenarioFingerprint(steel(), PRODUCT_A);
    expect(fingerprintSimilarity(a, b)).toBeLessThan(0.8);
  });
});

describe("parseSemanticJudgeResult", () => {
  it("parses duplicate / different / unparseable", () => {
    expect(parseSemanticJudgeResult("duplicate")).toBe(true);
    expect(parseSemanticJudgeResult("  DIFFERENT  ")).toBe(false);
    expect(parseSemanticJudgeResult("maybe")).toBeNull();
  });
});

describe("buildSemanticJudgePrompt", () => {
  it("includes both scenarios and asks for a one-word verdict", () => {
    const p = buildSemanticJudgePrompt("A text", "B text");
    expect(p).toContain("A text");
    expect(p).toContain("B text");
    expect(p).toContain("duplicate");
    expect(p).toContain("different");
  });
});

describe("runAntiDuplicatePass", () => {
  it("accepts a non-duplicate on the first attempt", async () => {
    const history = [entry(steel())];
    const regenerate = vi.fn(async () => null);
    const judge = vi.fn(async () => false);
    const result = await runAntiDuplicatePass(coffee(), history, regenerate, judge);
    expect(result.accepted).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.scenes.length).toBe(3);
    expect(regenerate).not.toHaveBeenCalled();
    expect(judge).not.toHaveBeenCalled();
  });

  it("regenerates once and accepts a successful variation", async () => {
    const history = [entry(coffee())];
    const regenerate = vi.fn(async () => steel());
    const judge = vi.fn(async () => false);
    const result = await runAntiDuplicatePass(coffee(), history, regenerate, judge);
    expect(result.accepted).toBe(true);
    expect(result.attempts).toBe(2);
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(result.scenes[0]).toContain("Steel");
  });

  it("rejects after all retries when still a duplicate", async () => {
    const history = [entry(coffee())];
    // Regeneration keeps returning the exact same film (a hard duplicate).
    const regenerate = vi.fn(async () => coffee());
    const judge = vi.fn(async () => false);
    const result = await runAntiDuplicatePass(coffee(), history, regenerate, judge, 3);
    expect(result.accepted).toBe(false);
    expect(result.scenes).toEqual([]);
    expect(result.attempts).toBe(3);
    expect(result.reason).toBe("duplicate");
    expect(regenerate).toHaveBeenCalledTimes(2);
  });

  it("rejects when regeneration returns empty", async () => {
    const history = [entry(coffee())];
    const regenerate = vi.fn(async () => []);
    const judge = vi.fn(async () => false);
    const result = await runAntiDuplicatePass(coffee(), history, regenerate, judge);
    expect(result.accepted).toBe(false);
    expect(result.scenes).toEqual([]);
    expect(result.reason).toBe("empty");
  });

  it("uses the semantic judge for the ambiguous band (synonym duplicate)", async () => {
    // A synonym-only variation lands in the ambiguous band; the judge says duplicate.
    const history = [entry(coffee())];
    const candidate = scenario("Coffee", "wide", "zoom", "the barista grins and passes the mug");
    const regenerate = vi.fn(async () => steel());
    const judge = vi.fn(async () => true);
    const result = await runAntiDuplicatePass(candidate, history, regenerate, judge);
    expect(judge).toHaveBeenCalled();
    expect(result.accepted).toBe(true); // regenerated to steel, which is different
    expect(result.attempts).toBe(2);
  });

  it("flags a re-told story with a new identity as a duplicate (identity is metadata)", async () => {
    // Same story, but the candidate uses a different product identity.
    const history = [entry(coffee(), PRODUCT_A)];
    const candidate = coffee(); // identical story text
    const regenerate = vi.fn(async () => steel());
    const judge = vi.fn(async () => false);
    const result = await runAntiDuplicatePass(candidate, history, regenerate, judge);
    // The fast fingerprint is identity-independent, so it is a hard duplicate.
    expect(result.accepted).toBe(true);
    expect(result.attempts).toBe(2);
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it("does not flag a genuinely different film even with the same identity", async () => {
    const history = [entry(coffee(), PRODUCT_A)];
    const regenerate = vi.fn(async () => null);
    const judge = vi.fn(async () => false);
    const result = await runAntiDuplicatePass(steel(), history, regenerate, judge);
    expect(result.accepted).toBe(true);
    expect(result.attempts).toBe(1);
  });
});

describe("buildVariationInstruction", () => {
  it("names the dimensions that must change and forbids synonym swaps", () => {
    const instr = buildVariationInstruction();
    expect(instr).toContain("STORY CONCEPT");
    expect(instr).toContain("OPENING");
    expect(instr).toContain("MAIN ACTION");
    expect(instr).toContain("CAMERA FLOW");
    expect(instr).toContain("ENDING");
    expect(instr.toLowerCase()).toContain("synonym");
  });
});
