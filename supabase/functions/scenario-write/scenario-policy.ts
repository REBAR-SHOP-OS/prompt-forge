export interface ScenarioDurationPolicy {
  durationSeconds: number;
  sceneCount: number;
  sceneSeconds: number;
  minWordsPerScene: number;
  maxWordsPerScene: number;
  beatsPerScene: number;
  timedBeats: string;
  maxSpokenWordsPerScene: number;
}

export interface ScenarioQualityIssue {
  type: "scene-count" | "word-count";
  message: string;
}

export interface ScenarioQualityResult {
  scenes: string[];
  warning?: string;
  retried: boolean;
}

export const SCENE_DELIMITER = "===SCENE===";

const SUPPORTED_DURATIONS = [5, 10, 15, 30, 45, 60, 90, 135] as const;

export function getScenarioDurationPolicy(durationSeconds: number): ScenarioDurationPolicy {
  if (!SUPPORTED_DURATIONS.includes(durationSeconds as (typeof SUPPORTED_DURATIONS)[number])) {
    throw new Error(`Unsupported scenario duration: ${durationSeconds}`);
  }

  if (durationSeconds <= 15) {
    const shortRules = {
      5: { minWords: 25, maxWords: 40, beats: 1, timedBeats: "0-5s", maxSpokenWords: 10 },
      10: { minWords: 45, maxWords: 70, beats: 2, timedBeats: "0-5s, 5-10s", maxSpokenWords: 20 },
      15: { minWords: 70, maxWords: 100, beats: 3, timedBeats: "0-4s, 4-9s, 9-15s", maxSpokenWords: 30 },
    } as const;
    const rule = shortRules[durationSeconds as 5 | 10 | 15];
    return {
      durationSeconds,
      sceneCount: 1,
      sceneSeconds: durationSeconds,
      minWordsPerScene: rule.minWords,
      maxWordsPerScene: rule.maxWords,
      beatsPerScene: rule.beats,
      timedBeats: rule.timedBeats,
      maxSpokenWordsPerScene: rule.maxSpokenWords,
    };
  }

  return {
    durationSeconds,
    sceneCount: durationSeconds / 15,
    sceneSeconds: 15,
    minWordsPerScene: 70,
    maxWordsPerScene: 100,
    beatsPerScene: 3,
    timedBeats: "0-4s, 4-9s, 9-15s",
    maxSpokenWordsPerScene: 30,
  };
}

// ---------------------------------------------------------------------------
// Plan-based policy (Make Full Film wizard). The unit of work is a 5-second
// plan/shot, not a 15-second card. A duration maps to duration/5 plans:
//   5→1, 10→2, 15→3, 30→6, 45→9, 60→12, 90→18, 135→27
// ---------------------------------------------------------------------------

export type PlanCoverage = "wide" | "medium" | "close";

export interface PlanDurationPolicy {
  durationSeconds: number;
  planCount: number;
  planSeconds: number;
  minWordsPerPlan: number;
  maxWordsPerPlan: number;
  coverage: PlanCoverage[];
  maxSpokenWordsPerFilm: number;
}

/** Per-card clip durations (5|10|15), matching the frontend computeClipDurations. */
function clipDurationsFor(durationSeconds: number): number[] {
  if (durationSeconds <= 15) return [durationSeconds];
  return Array.from({ length: durationSeconds / 15 }, () => 15);
}

/**
 * Camera coverage (framing) per plan, derived from the card structure:
 *   - a 5s card  → 1 plan  → medium
 *   - a 10s card → 2 plans → wide, close
 *   - a 15s card → 3 plans → wide, medium, close
 * Multi-card films (30/45/60/90/135) are all 15s cards, so coverage cycles
 * wide → medium → close across the whole film.
 */
export function computePlanCoverage(durationSeconds: number): PlanCoverage[] {
  const coverage: PlanCoverage[] = [];
  for (const card of clipDurationsFor(durationSeconds)) {
    if (card === 5) coverage.push("medium");
    else if (card === 10) coverage.push("wide", "close");
    else coverage.push("wide", "medium", "close");
  }
  return coverage;
}

export function getPlanDurationPolicy(durationSeconds: number): PlanDurationPolicy {
  if (!SUPPORTED_DURATIONS.includes(durationSeconds as (typeof SUPPORTED_DURATIONS)[number])) {
    throw new Error(`Unsupported scenario duration: ${durationSeconds}`);
  }
  return {
    durationSeconds,
    planCount: durationSeconds / 5,
    planSeconds: 5,
    minWordsPerPlan: 25,
    maxWordsPerPlan: 40,
    coverage: computePlanCoverage(durationSeconds),
    maxSpokenWordsPerFilm: durationSeconds * 2,
  };
}

export function parsePlanScenarios(raw: string, durationSeconds: number): string[] {
  const cleaned = stripQuotes(raw);
  if (!cleaned) return [];

  const { planCount } = getPlanDurationPolicy(durationSeconds);
  if (planCount === 1) return [cleaned];

  const delimited = cleaned
    .split(/\r?\n?\s*===SCENE===\s*\r?\n?/i)
    .map(stripQuotes)
    .filter(Boolean);
  if (delimited.length === planCount) return delimited;

  const paragraphs = cleaned
    .split(/\n\s*\n+/)
    .map(stripQuotes)
    .filter(Boolean);
  return paragraphs.length === planCount ? paragraphs : [];
}

export function assessPlanScenarios(plans: string[], durationSeconds: number): ScenarioQualityIssue[] {
  const policy = getPlanDurationPolicy(durationSeconds);
  const issues: ScenarioQualityIssue[] = [];

  if (plans.length !== policy.planCount) {
    issues.push({
      type: "scene-count",
      message: `received ${plans.length} of ${policy.planCount} required plans`,
    });
    return issues;
  }

  plans.forEach((plan, index) => {
    const words = countScenarioWords(plan);
    if (words < policy.minWordsPerPlan || words > policy.maxWordsPerPlan) {
      issues.push({
        type: "word-count",
        message: `plan ${index + 1} has ${words} words; expected ${policy.minWordsPerPlan}-${policy.maxWordsPerPlan}`,
      });
    }
  });

  return issues;
}

export function buildPlanCorrectiveRetryInstruction(durationSeconds: number, issues: ScenarioQualityIssue[]): string {
  const policy = getPlanDurationPolicy(durationSeconds);
  const delimiterRule = policy.planCount > 1
    ? ` Return exactly ${policy.planCount} plans separated only by ${SCENE_DELIMITER} on its own line.`
    : " Return exactly one plan.";

  return [
    "CORRECTIVE RETRY — rewrite the complete scenario once; do not explain the correction.",
    `Problems in the prior output: ${issues.map((issue) => issue.message).join("; ")}.`,
    delimiterRule,
    `Every plan must contain ${policy.minWordsPerPlan}-${policy.maxWordsPerPlan} words and exactly one 5-second beat (0-5s).`,
    "Every plan must include concrete action, framing or camera movement, a lighting or emotional change, and forward story progress without repetition.",
    `Keep the whole film's narration within ${policy.maxSpokenWordsPerFilm} naturally speakable words, divided across the plans.`,
  ].join(" ");
}

function planQualityWarning(durationSeconds: number, issues: ScenarioQualityIssue[]): string {
  const policy = getPlanDurationPolicy(durationSeconds);
  return `Scenario quality warning after one corrective retry: ${issues.map((issue) => issue.message).join("; ")}. Expected ${policy.planCount} plan${policy.planCount === 1 ? "" : "s"}, ${policy.minWordsPerPlan}-${policy.maxWordsPerPlan} words per plan, and one 5-second beat per plan.`;
}

export async function runPlanQualityPass(
  durationSeconds: number,
  initialRaw: string,
  correctiveRetry: (instruction: string) => Promise<string | null>,
): Promise<ScenarioQualityResult> {
  const initialPlans = parsePlanScenarios(initialRaw, durationSeconds);
  const initialIssues = assessPlanScenarios(initialPlans, durationSeconds);
  if (initialIssues.length === 0) return { scenes: initialPlans, retried: false };

  let retryRaw: string | null = null;
  try {
    retryRaw = await correctiveRetry(buildPlanCorrectiveRetryInstruction(durationSeconds, initialIssues));
  } catch {
    retryRaw = null;
  }

  const finalRaw = retryRaw?.trim() || initialRaw;
  const finalPlans = parsePlanScenarios(finalRaw, durationSeconds);
  const finalIssues = assessPlanScenarios(finalPlans, durationSeconds);
  if (finalIssues.length === 0) return { scenes: finalPlans, retried: true };

  const fallback = finalPlans.length > 0 ? finalPlans : (stripQuotes(finalRaw) ? [stripQuotes(finalRaw)] : []);
  return {
    scenes: fallback,
    retried: true,
    warning: planQualityWarning(durationSeconds, finalIssues),
  };
}

export function countScenarioWords(value: string): number {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

function stripQuotes(value: string): string {
  return value.replace(/^["'`]+|["'`]+$/g, "").trim();
}

export function parseScenarioScenes(raw: string, durationSeconds: number): string[] {
  const cleaned = stripQuotes(raw);
  if (!cleaned) return [];

  const { sceneCount } = getScenarioDurationPolicy(durationSeconds);
  if (sceneCount === 1) return [cleaned];

  const delimited = cleaned
    .split(/\r?\n?\s*===SCENE===\s*\r?\n?/i)
    .map(stripQuotes)
    .filter(Boolean);
  if (delimited.length === sceneCount) return delimited;

  const paragraphs = cleaned
    .split(/\n\s*\n+/)
    .map(stripQuotes)
    .filter(Boolean);
  return paragraphs.length === sceneCount ? paragraphs : [];
}

export function assessScenarioScenes(scenes: string[], durationSeconds: number): ScenarioQualityIssue[] {
  const policy = getScenarioDurationPolicy(durationSeconds);
  const issues: ScenarioQualityIssue[] = [];

  if (scenes.length !== policy.sceneCount) {
    issues.push({
      type: "scene-count",
      message: `received ${scenes.length} of ${policy.sceneCount} required scenes`,
    });
    return issues;
  }

  scenes.forEach((scene, index) => {
    const words = countScenarioWords(scene);
    if (words < policy.minWordsPerScene || words > policy.maxWordsPerScene) {
      issues.push({
        type: "word-count",
        message: `scene ${index + 1} has ${words} words; expected ${policy.minWordsPerScene}-${policy.maxWordsPerScene}`,
      });
    }
  });

  return issues;
}

export function buildCorrectiveRetryInstruction(durationSeconds: number, issues: ScenarioQualityIssue[]): string {
  const policy = getScenarioDurationPolicy(durationSeconds);
  const delimiterRule = policy.sceneCount > 1
    ? ` Return exactly ${policy.sceneCount} scenes separated only by ${SCENE_DELIMITER} on its own line.`
    : " Return exactly one scene.";

  return [
    "CORRECTIVE RETRY — rewrite the complete scenario once; do not explain the correction.",
    `Problems in the prior output: ${issues.map((issue) => issue.message).join("; ")}.`,
    delimiterRule,
    `Every scene must contain ${policy.minWordsPerScene}-${policy.maxWordsPerScene} words and exactly ${policy.beatsPerScene} continuous timed beat${policy.beatsPerScene === 1 ? "" : "s"} (${policy.timedBeats}).`,
    "Every beat must include concrete action, framing or camera movement, a lighting or emotional change, and forward story progress without repetition.",
    `Keep all narration and dialogue within ${policy.maxSpokenWordsPerScene} naturally speakable words per scene.`,
  ].join(" ");
}

function qualityWarning(durationSeconds: number, issues: ScenarioQualityIssue[]): string {
  const policy = getScenarioDurationPolicy(durationSeconds);
  return `Scenario quality warning after one corrective retry: ${issues.map((issue) => issue.message).join("; ")}. Expected ${policy.sceneCount} scene${policy.sceneCount === 1 ? "" : "s"}, ${policy.minWordsPerScene}-${policy.maxWordsPerScene} words per scene, and ${policy.beatsPerScene} visual beat${policy.beatsPerScene === 1 ? "" : "s"} per scene.`;
}

export async function runScenarioQualityPass(
  durationSeconds: number,
  initialRaw: string,
  correctiveRetry: (instruction: string) => Promise<string | null>,
): Promise<ScenarioQualityResult> {
  const initialScenes = parseScenarioScenes(initialRaw, durationSeconds);
  const initialIssues = assessScenarioScenes(initialScenes, durationSeconds);
  if (initialIssues.length === 0) return { scenes: initialScenes, retried: false };

  let retryRaw: string | null = null;
  try {
    retryRaw = await correctiveRetry(buildCorrectiveRetryInstruction(durationSeconds, initialIssues));
  } catch {
    retryRaw = null;
  }

  const finalRaw = retryRaw?.trim() || initialRaw;
  const finalScenes = parseScenarioScenes(finalRaw, durationSeconds);
  const finalIssues = assessScenarioScenes(finalScenes, durationSeconds);
  if (finalIssues.length === 0) return { scenes: finalScenes, retried: true };

  const fallback = finalScenes.length > 0 ? finalScenes : (stripQuotes(finalRaw) ? [stripQuotes(finalRaw)] : []);
  return {
    scenes: fallback,
    retried: true,
    warning: qualityWarning(durationSeconds, finalIssues),
  };
}
