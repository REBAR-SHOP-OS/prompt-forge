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
