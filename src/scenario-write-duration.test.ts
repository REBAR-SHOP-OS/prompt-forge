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
  it("requests one unified scenario while retaining 5-second Wan slots", () => {
    const source = writeFilmScenarioSource();

    expect(source).toContain("const filmDuration = options?.duration ?? durationSeconds");
    expect(source).toMatch(
      /functions\.invoke\(['"]scenario-write['"],[\s\S]*?durationSeconds:\s*filmDuration,[\s\S]*?unit:\s*options\?\.unit\s*\?\?\s*["']film["']/,
    );

    expect(getPlanDurationPolicy(30)).toMatchObject({
      durationSeconds: 30,
      planCount: 6,
      planSeconds: 5,
    });

    const prompt = buildSystemPrompt(30, undefined, false, undefined, "Rebar fabrication", "en", true, "film");
    expect(prompt).toContain("Write ONE unified, cohesive scenario")
    expect(prompt).toContain("6 consecutive 5-second beats")
    expect(prompt).toContain("DO NOT expose, number, label, list, or separate those beats")
  });
});
