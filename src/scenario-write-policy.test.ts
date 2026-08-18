import { describe, expect, it, vi } from "vitest";
import {
  assessScenarioScenes,
  buildCorrectiveRetryInstruction,
  countScenarioWords,
  getScenarioDurationPolicy,
  runScenarioQualityPass,
  SCENE_DELIMITER,
} from "../supabase/functions/scenario-write/scenario-policy";

const FIVE_SECOND_EXAMPLE = "A steel rebar sketch snaps into focus as the camera rushes across the drafting table; cold blue light warms to gold while precise bars rise into a finished structure, turning uncertainty into confident momentum.";

const FIFTEEN_SECOND_EXAMPLE = "0-4s: Scattered rebar sketches whip across a dark drafting table as a macro camera dives toward one precise mark; icy side light sharpens the confusion into curiosity. 4-9s: The mark expands into a glowing three-dimensional cage while the camera orbits upward; amber light spreads, and the engineer's hesitation becomes focused confidence. 9-15s: Steel bars lock into a finished tower as the camera cranes toward the skyline; sunrise floods the frame, delivering a bold payoff of certainty, speed, and build-ready momentum.";

function words(count: number, prefix = "visual"): string {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(" ");
}

describe("scenario duration policy", () => {
  it.each([
    [5, 1, 25, 40, 1],
    [10, 1, 45, 70, 2],
    [15, 1, 70, 100, 3],
  ])("maps %ss to the required word range and beats", (duration, scenes, min, max, beats) => {
    expect(getScenarioDurationPolicy(duration)).toMatchObject({
      sceneCount: scenes,
      minWordsPerScene: min,
      maxWordsPerScene: max,
      beatsPerScene: beats,
    });
  });

  it.each([30, 45, 60, 90, 135])("maps every scene of a %ss film to a 15s 70-100 word clip", (duration) => {
    expect(getScenarioDurationPolicy(duration)).toMatchObject({
      sceneCount: duration / 15,
      sceneSeconds: 15,
      minWordsPerScene: 70,
      maxWordsPerScene: 100,
      beatsPerScene: 3,
    });
  });

  it("keeps representative 5s and 15s outputs inside their ranges", () => {
    expect(countScenarioWords(FIVE_SECOND_EXAMPLE)).toBeGreaterThanOrEqual(25);
    expect(countScenarioWords(FIVE_SECOND_EXAMPLE)).toBeLessThanOrEqual(40);
    expect(countScenarioWords(FIFTEEN_SECOND_EXAMPLE)).toBeGreaterThanOrEqual(70);
    expect(countScenarioWords(FIFTEEN_SECOND_EXAMPLE)).toBeLessThanOrEqual(100);
  });

  it("validates every 15s scene in a multi-scene film", () => {
    expect(assessScenarioScenes([words(70, "first"), words(100, "second")], 30)).toEqual([]);
    expect(assessScenarioScenes([words(69, "first"), words(100, "second")], 30)).toEqual([
      expect.objectContaining({ type: "word-count", message: expect.stringContaining("scene 1 has 69 words") }),
    ]);
  });
});

describe("scenario corrective retry", () => {
  it("retries a short 5s output once and returns the corrected output", async () => {
    const retry = vi.fn().mockResolvedValue(words(25, "corrected"));

    const result = await runScenarioQualityPass(5, words(24, "short"), retry);

    expect(retry).toHaveBeenCalledOnce();
    expect(retry.mock.calls[0][0]).toContain("25-40 words");
    expect(result).toEqual({ scenes: [words(25, "corrected")], retried: true });
  });

  it("retries an incomplete multi-scene response once and preserves exact scene count", async () => {
    const corrected = `${words(70, "opening")}\n${SCENE_DELIMITER}\n${words(70, "payoff")}`;
    const retry = vi.fn().mockResolvedValue(corrected);

    const result = await runScenarioQualityPass(30, words(70, "only"), retry);

    expect(retry).toHaveBeenCalledOnce();
    expect(retry.mock.calls[0][0]).toContain("received 0 of 2 required scenes");
    expect(result.scenes).toHaveLength(2);
    expect(result.warning).toBeUndefined();
  });

  it("returns one transparent warning after one failed corrective retry", async () => {
    const retry = vi.fn().mockResolvedValue(words(12, "still-short"));

    const result = await runScenarioQualityPass(15, words(10, "short"), retry);

    expect(retry).toHaveBeenCalledOnce();
    expect(result.retried).toBe(true);
    expect(result.warning).toContain("after one corrective retry");
    expect(result.warning).toContain("scene 1 has 12 words; expected 70-100");
  });

  it("does not retry an output already inside the duration range", async () => {
    const retry = vi.fn();

    const result = await runScenarioQualityPass(10, words(45), retry);

    expect(retry).not.toHaveBeenCalled();
    expect(result.warning).toBeUndefined();
    expect(result.retried).toBe(false);
  });

  it("builds a corrective instruction with beats, camera, lighting, story, and speech limits", () => {
    const instruction = buildCorrectiveRetryInstruction(15, [
      { type: "word-count", message: "scene 1 has 20 words; expected 70-100" },
    ]);

    expect(instruction).toContain("exactly 3 continuous timed beats");
    expect(instruction).toContain("framing or camera movement");
    expect(instruction).toContain("lighting or emotional change");
    expect(instruction).toContain("forward story progress");
    expect(instruction).toContain("30 naturally speakable words");
  });
});
