import { describe, expect, it } from "vitest";
import {
  getPlanDurationPolicy,
  parsePlanScenarios,
  runPlanQualityPass,
  SCENE_DELIMITER,
} from "../supabase/functions/scenario-write/scenario-policy.ts";

function sixPlans(prefix = "Plan"): string {
  // Each plan must be 25-40 words to pass the plan word-count check.
  const body =
    "shows the hero product in sharp focus, gliding across a clean studio set while a soft key light traces its edges and a vivid background gradient shifts behind it, building desire and momentum.";
  return Array.from({ length: 6 }, (_, i) => `${prefix} ${i + 1} ${body}`)
    .join(` ${SCENE_DELIMITER} `);
}

const SINGLE_BLOCK =
  "One undelimited block of text describing the whole film with no scene break, and it cannot be split into the six five-second plans the thirty second runtime demands at all.";

describe("plan policy — duration → planCount", () => {
  it("maps a 30s film to exactly 6 plans (30/5)", () => {
    expect(getPlanDurationPolicy(30).planCount).toBe(6);
    expect(getPlanDurationPolicy(30).planSeconds).toBe(5);
  });

  it("covers the full supported duration range with duration/5 plans", () => {
    const expected: Record<number, number> = { 5: 1, 10: 2, 15: 3, 30: 6, 45: 9, 60: 12, 90: 18, 135: 27 };
    for (const [duration, count] of Object.entries(expected)) {
      expect(getPlanDurationPolicy(Number(duration)).planCount).toBe(count);
    }
  });
});

describe("parsePlanScenarios", () => {
  it("parses 6 well-formed ===SCENE===-delimited plans for 30s", () => {
    const parsed = parsePlanScenarios(sixPlans(), 30);
    expect(parsed).toHaveLength(6);
  });

  it("returns [] when the delimiter is broken and paragraph split cannot reach 6", () => {
    // Only one ===SCENE=== among what should be six sections -> wrong count.
    const broken = "First. ===SCENE=== Second."; // 2 delimited sections, not 6
    expect(parsePlanScenarios(broken, 30)).toEqual([]);
  });

  it("returns [] when the model emits one undelimited block for a 30s film", () => {
    const single = "A single paragraph describing the whole film without any delimiter.";
    expect(parsePlanScenarios(single, 30)).toEqual([]);
  });
});

describe("runPlanQualityPass regression (30s → 6 plans)", () => {
  it("passes through 6 valid plans with no retry", async () => {
    const result = await runPlanQualityPass(30, sixPlans(), async () => {
      throw new Error("should not be called");
    });
    expect(result.retried).toBe(false);
    expect(result.scenes).toHaveLength(6);
    expect(result.warning).toBeUndefined();
  });

  it("recovers via corrective retry when the initial output is malformed", async () => {
    const initial = "A single paragraph without delimiters, so the initial parse fails.";
    const good = sixPlans("Retried");
    let retried = false;
    const result = await runPlanQualityPass(30, initial, async () => {
      retried = true;
      return good;
    });
    expect(retried).toBe(true);
    expect(result.retried).toBe(true);
    expect(result.scenes).toHaveLength(6);
  });

  it("returns empty scenes (not a fake single plan) when retry still cannot produce 6 plans", async () => {
    // Both the initial output and the retried output are one undelimited block.
    // The fix must NOT wrap them as a single valid plan.
    const singleBlock = "One undelimited block that cannot be split into six 5-second plans.";
    let retryCount = 0;
    const result = await runPlanQualityPass(30, singleBlock, async () => {
      retryCount += 1;
      return singleBlock; // retry also malformed
    });
    expect(retryCount).toBe(1);
    expect(result.retried).toBe(true);
    expect(result.scenes).toEqual([]);
    expect(result.warning).toBeDefined();
  });

  it("still returns a single valid plan for a 5s film (planCount 1)", async () => {
    const onePlan =
      "A single five-second showcase that opens on the hero product, holds a clean studio close-up, and lands a crisp selling point before the frame cuts.";
    const result = await runPlanQualityPass(5, onePlan, async () => {
      throw new Error("should not be called");
    });
    expect(result.retried).toBe(false);
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0]).toBe(onePlan);
  });
});
