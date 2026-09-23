import { describe, expect, it } from "vitest";
import {
  buildPreviewShotQualityPrompt,
  parsePreviewShotQualityResponse,
} from "./preview-shot-quality.ts";

const passing = {
  physicalPlausibility: { passed: true, reason: "The grip and tool contact are credible." },
  productRelevance: { passed: true, reason: "The selected product is the focus." },
  surroundingContinuity: { passed: true, reason: "The state advances from setup toward payoff." },
  plannedActionFaithfulness: { passed: true, reason: "The frame shows the planned fastening action." },
  contradiction: null,
  summary: "Credible planned action.",
};

describe("preview shot quality prompt", () => {
  it("grounds all four criteria in the actual image, product, plan, and neighbors", () => {
    const prompt = buildPreviewShotQualityPrompt({
      shotIndex: 1,
      totalShots: 3,
      shotMode: "product",
      productName: "Rebar tie wire",
      plannedAction: "A worker fastens the crossing bars with tie wire.",
      previousPlannedAction: "The worker positions the bars.",
      nextPlannedAction: "The camera reveals the completed cage.",
    });

    expect(prompt).toContain("ACTUAL IMAGE for shot 2 of 3");
    expect(prompt).toContain("Rebar tie wire");
    expect(prompt).toContain("physicalPlausibility");
    expect(prompt).toContain("productRelevance");
    expect(prompt).toContain("surroundingContinuity");
    expect(prompt).toContain("plannedActionFaithfulness");
    expect(prompt).toContain("credible instant within an action");
  });

  it("does not require a product in character-only or environment-only shots", () => {
    const characterPrompt = buildPreviewShotQualityPrompt({
      shotIndex: 0,
      totalShots: 2,
      shotMode: "character",
      plannedAction: "The presenter addresses the camera.",
    });
    const environmentPrompt = buildPreviewShotQualityPrompt({
      shotIndex: 1,
      totalShots: 2,
      shotMode: "environment",
      plannedAction: "The empty workshop establishes the location.",
    });

    expect(characterPrompt).toContain("CHARACTER_ONLY");
    expect(characterPrompt).toContain("product is intentionally absent");
    expect(environmentPrompt).toContain("ENVIRONMENT_ONLY");
    expect(environmentPrompt).toContain("both selected identities are correctly absent");
  });
});

describe("preview shot quality response", () => {
  it("accepts a complete passing verdict", () => {
    expect(parsePreviewShotQualityResponse(JSON.stringify(passing))).toMatchObject({
      passed: true,
      contradiction: null,
      summary: "Credible planned action.",
    });
  });

  it("fails aggregate quality when one criterion fails", () => {
    const result = parsePreviewShotQualityResponse(JSON.stringify({
      ...passing,
      plannedActionFaithfulness: { passed: false, reason: "The worker only poses beside the product." },
    }));
    expect(result?.passed).toBe(false);
  });

  it("fails aggregate quality when the image contradicts the plan", () => {
    const result = parsePreviewShotQualityResponse(JSON.stringify({
      ...passing,
      contradiction: "The tool is separated from the fastener.",
    }));
    expect(result?.passed).toBe(false);
  });

  it("fails closed on malformed or incomplete evaluator output", () => {
    expect(parsePreviewShotQualityResponse("not json")).toBeNull();
    expect(parsePreviewShotQualityResponse(JSON.stringify({ summary: "missing criteria" }))).toBeNull();
  });
});
