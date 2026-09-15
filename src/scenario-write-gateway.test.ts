import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  readScenarioAssistantText,
  requestScenarioGateway,
} from "../supabase/functions/scenario-write/scenario-gateway.ts";
import { runPlanQualityPass } from "../supabase/functions/scenario-write/scenario-policy.ts";

const SUPPORTED_DURATIONS = [5, 10, 15, 30, 45, 60, 90, 135] as const;
const indexSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/scenario-write/index.ts"),
  "utf8",
);

describe("scenario-write gateway boundary", () => {
  it.each(SUPPORTED_DURATIONS)(
    "contains an initial transport rejection for %ss instead of throwing Internal error",
    async (durationSeconds) => {
      const failure = new TypeError("fetch failed");
      const request = vi.fn(async (): Promise<Response> => {
        throw failure;
      });
      const logError = vi.fn();

      const response = await requestScenarioGateway(
        request,
        { durationSeconds, unit: "plan", stage: "initial" },
        logError,
      );

      expect(response.status).toBe(503);
      expect(request).toHaveBeenCalledOnce();
      expect(logError).toHaveBeenCalledWith(
        "scenario-write gateway request error",
        expect.objectContaining({
          durationSeconds,
          unit: "plan",
          stage: "initial",
          error: failure,
        }),
      );
    },
  );

  it.each(SUPPORTED_DURATIONS)(
    "turns non-string assistant content into the existing controlled empty-plan path for %ss",
    async (durationSeconds) => {
      const logError = vi.fn();
      const raw = readScenarioAssistantText(
        {
          choices: [{ message: { content: [{ type: "text", text: "provider refusal" }] } }],
        },
        "scenario-write",
        logError,
      );

      const quality = await runPlanQualityPass(durationSeconds, raw, async () => null);

      expect(raw).toBe("");
      expect(quality.scenes).toEqual([]);
      expect(logError).toHaveBeenCalledWith(
        "scenario-write: invalid assistant content",
        { contentType: "array" },
      );
    },
  );

  it("trims a valid assistant string", () => {
    expect(
      readScenarioAssistantText(
        { choices: [{ message: { content: "  valid scenario  " } }] },
        "scenario-write",
      ),
    ).toBe("valid scenario");
  });

  it("keeps every gateway response read behind the safe content parser", () => {
    expect(indexSource.match(/readScenarioAssistantText\(/g)).toHaveLength(5);
    expect(indexSource).not.toMatch(/message\?\.content\s*\?\?\s*["']{2}\)\.trim\(\)/);
    expect(indexSource).toMatch(/requestScenarioGateway\([\s\S]*?stage:\s*correctiveInstruction \? "retry" : "initial"/);
    expect(indexSource).toContain('{ durationSeconds: duration, unit, stage: "semantic-judge" }');
    expect(indexSource).toMatch(/error: "AI gateway error"[\s\S]*?status:\s*502/);
  });
});
