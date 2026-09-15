import { describe, expect, it } from "vitest";
import {
  buildShotActionQualityPrompt,
  parseShotActionQualityResponse,
} from "./shot-action-quality";

const validResponse = {
  physicalPlausibility: { passed: true, reason: "The lift and hand contact are coherent." },
  productRelevance: { passed: true, reason: "The worker visibly demonstrates the selected stirrup." },
  surroundingContinuity: { passed: true, reason: "The product remains on the same bench between shots." },
  plannedActionFaithfulness: { passed: true, reason: "The worker performs the planned bend inspection." },
  contradiction: null,
  summary: "The generated shot performs the planned product action coherently.",
};

describe("shot action-quality model contract", () => {
  it("accepts a fully valid observed behavior and includes all four criteria in the prompt", () => {
    const prompt = buildShotActionQualityPrompt({
      shotIndex: 1,
      totalShots: 3,
      plannedAction: "The worker lifts and inspects the stirrup bend.",
      previousPlannedAction: "The stirrup rests on the bench.",
      nextPlannedAction: "The worker installs the stirrup in the cage.",
      productName: "Rebar stirrup",
    });
    const parsed = parseShotActionQualityResponse(JSON.stringify(validResponse));

    expect(prompt).toContain("physicalPlausibility");
    expect(prompt).toContain("productRelevance");
    expect(prompt).toContain("surroundingContinuity");
    expect(prompt).toContain("plannedActionFaithfulness");
    expect(prompt).toContain("shot 2 of 3");
    expect(parsed?.passed).toBe(true);
  });

  it("rejects an invalid physical action even when the other criteria pass", () => {
    const parsed = parseShotActionQualityResponse(JSON.stringify({
      ...validResponse,
      physicalPlausibility: { passed: false, reason: "The stirrup floats through the worker's hand." },
      summary: "The intended action is visible but physically impossible.",
    }));

    expect(parsed?.passed).toBe(false);
    expect(parsed?.physicalPlausibility.passed).toBe(false);
  });

  it("rejects a plan or continuity contradiction even when all criterion booleans are true", () => {
    const parsed = parseShotActionQualityResponse(JSON.stringify({
      ...validResponse,
      contradiction: "The product is intact here although the preceding plan leaves it cut in half.",
    }));

    expect(parsed?.passed).toBe(false);
    expect(parsed?.contradiction).toContain("preceding plan");
  });

  it("fails closed on malformed evaluator output", () => {
    expect(parseShotActionQualityResponse('{"physicalPlausibility":{"passed":true}}')).toBeNull();
    expect(parseShotActionQualityResponse("not json")).toBeNull();
  });
});
