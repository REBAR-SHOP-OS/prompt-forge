export interface ShotActionQualityInput {
  shotIndex: number;
  totalShots: number;
  plannedAction: string;
  previousPlannedAction?: string;
  nextPlannedAction?: string;
  productName?: string;
}

export interface ShotActionCriterion {
  passed: boolean;
  reason: string;
}

export interface ShotActionQualityEvaluation {
  physicalPlausibility: ShotActionCriterion;
  productRelevance: ShotActionCriterion;
  surroundingContinuity: ShotActionCriterion;
  plannedActionFaithfulness: ShotActionCriterion;
  contradiction: string | null;
  summary: string;
  passed: boolean;
}

const CRITERION_KEYS = [
  "physicalPlausibility",
  "productRelevance",
  "surroundingContinuity",
  "plannedActionFaithfulness",
] as const;

export function buildShotActionQualityPrompt(input: ShotActionQualityInput): string {
  const previous = input.previousPlannedAction?.trim() || "No previous shot (film opening).";
  const next = input.nextPlannedAction?.trim() || "No next shot (film ending).";
  const product = input.productName?.trim() || "the advertised product in the shot plan";

  return [
    "You are a strict quality-control reviewer for one ACTUAL generated advertising-video shot.",
    "Watch the entire supplied video. Judge observed behavior, not render completion, encoding quality, or whether a file exists.",
    `This is shot ${input.shotIndex + 1} of ${input.totalShots}.`,
    `Advertised product: ${product}`,
    `Planned action for this shot: ${input.plannedAction.trim()}`,
    `Previous planned shot: ${previous}`,
    `Next planned shot: ${next}`,
    "",
    "Evaluate all four independent criteria:",
    "1. physicalPlausibility: bodies, hands, objects, tools, forces, motion, contact, timing, and cause/effect behave plausibly; reject impossible deformation, teleportation, penetration, floating, broken interactions, or incoherent motion.",
    "2. productRelevance: the observed action visibly serves, demonstrates, uses, reveals, protects, compares, manufactures, or explains the advertised product; generic unrelated action fails.",
    "3. surroundingContinuity: the shot can connect coherently to the previous and next planned shots without contradicting subject identity, product state, location, direction of travel, action state, or causal sequence.",
    "4. plannedActionFaithfulness: the action that actually occurs matches the planned action and its essential subject/object interaction; a technically attractive substitute action fails.",
    "If the observed shot contradicts its plan or surrounding planned states, describe the contradiction. Do not excuse contradictions because the render looks polished.",
    "",
    "Respond with ONLY one compact JSON object, no markdown or preamble, with exactly this shape:",
    '{"physicalPlausibility":{"passed":boolean,"reason":string},"productRelevance":{"passed":boolean,"reason":string},"surroundingContinuity":{"passed":boolean,"reason":string},"plannedActionFaithfulness":{"passed":boolean,"reason":string},"contradiction":string|null,"summary":string}',
    "Each reason and summary must be a short, concrete sentence grounded in visible events.",
  ].join("\n");
}

export function parseShotActionQualityResponse(raw: string): ShotActionQualityEvaluation | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    return null;
  }

  const criteria = {} as Record<(typeof CRITERION_KEYS)[number], ShotActionCriterion>;
  for (const key of CRITERION_KEYS) {
    const value = parsed[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const criterion = value as Record<string, unknown>;
    if (typeof criterion.passed !== "boolean" || typeof criterion.reason !== "string") return null;
    criteria[key] = { passed: criterion.passed, reason: criterion.reason.trim() };
  }

  if (!(parsed.contradiction === null || typeof parsed.contradiction === "string")) return null;
  if (typeof parsed.summary !== "string") return null;
  const contradiction = typeof parsed.contradiction === "string" && parsed.contradiction.trim()
    ? parsed.contradiction.trim()
    : null;
  const passed = CRITERION_KEYS.every((key) => criteria[key].passed) && contradiction === null;

  return {
    physicalPlausibility: criteria.physicalPlausibility,
    productRelevance: criteria.productRelevance,
    surroundingContinuity: criteria.surroundingContinuity,
    plannedActionFaithfulness: criteria.plannedActionFaithfulness,
    contradiction,
    summary: parsed.summary.trim(),
    passed,
  };
}
