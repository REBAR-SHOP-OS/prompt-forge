import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "../supabase/functions/scenario-write/prompt.ts";
import { getPlanDurationPolicy } from "../supabase/functions/scenario-write/scenario-policy.ts";

const dashboardSource = readFileSync(
  resolve(process.cwd(), "src/modules/generator-ui/pages/DashboardPage.tsx"),
  "utf8",
);

function writeFilmScenarioSource(): string {
  const start = dashboardSource.indexOf("async function writeFilmScenario(");
  const end = dashboardSource.indexOf("async function generateFilmSceneImage(", start + 1);
  if (start < 0 || end < 0) throw new Error("Could not find writeFilmScenario source boundary");
  return dashboardSource.slice(start, end);
}

describe("scenario-write film duration contract", () => {
  it("threads the selected 30s duration into scenario-write plan generation", () => {
    const source = writeFilmScenarioSource();

    expect(source).toContain("const filmDuration = options?.duration ?? durationSeconds");
    expect(source).toMatch(
      /functions\.invoke\(['"]scenario-write['"],[\s\S]*?durationSeconds:\s*filmDuration,[\s\S]*?unit:\s*["']plan["']/,
    );

    expect(getPlanDurationPolicy(30)).toMatchObject({
      durationSeconds: 30,
      planCount: 6,
      planSeconds: 5,
    });

    const prompt = buildSystemPrompt(30, undefined, false, undefined, "Rebar fabrication", "en", true, "plan");
    expect(prompt).toContain("structured as SIX sequential 5-second plans");
    expect(prompt).toContain("Output EXACTLY 6 plan blocks");
  });
});
