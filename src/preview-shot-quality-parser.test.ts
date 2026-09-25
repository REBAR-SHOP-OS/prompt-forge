import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePreviewShotQualityResponse } from "../supabase/functions/_shared/preview-shot-quality";

const ok = { passed: true, reason: "fine" };

describe("preview quality parser tolerance", () => {
  it("accepts string booleans and missing summary/contradiction without inventing a pass", () => {
    const raw = JSON.stringify({
      physicalPlausibility: { passed: "false", reason: "Hook floats." },
      productRelevance: ok,
      surroundingContinuity: ok,
      plannedActionFaithfulness: ok,
    });
    const result = parsePreviewShotQualityResponse(raw);
    expect(result?.passed).toBe(false);
    expect(result?.contradiction).toBeNull();
    expect(result?.summary).toBe("Hook floats.");
  });

  it("still fails closed on unknown verdicts and non-JSON", () => {
    expect(parsePreviewShotQualityResponse("")).toBeNull();
    expect(parsePreviewShotQualityResponse("I cannot evaluate this.")).toBeNull();
    expect(parsePreviewShotQualityResponse(JSON.stringify({
      physicalPlausibility: { passed: "maybe", reason: "" },
      productRelevance: ok, surroundingContinuity: ok, plannedActionFaithfulness: ok, summary: "x",
    }))).toBeNull();
  });

  it("endpoint requests JSON mode and re-asks once before returning 502", () => {
    const src = readFileSync("supabase/functions/film-preview-quality/index.ts", "utf8");
    expect(src).toContain('response_format: { type: "json_object" }');
    expect(src).toContain("MAX_EVALUATOR_ATTEMPTS = 2");
    expect(src).toContain("Preview quality evaluator returned an invalid response");
  });
});
