export interface PreviewShotQualityInput {
  shotIndex: number;
  totalShots: number;
  shotMode?: "product" | "character" | "environment" | "interaction";
  plannedAction: string;
  previousPlannedAction?: string;
  nextPlannedAction?: string;
  productName?: string;
}

export interface PreviewShotCriterion {
  passed: boolean;
  reason: string;
}

export interface PreviewShotQualityEvaluation {
  physicalPlausibility: PreviewShotCriterion;
  productRelevance: PreviewShotCriterion;
  surroundingContinuity: PreviewShotCriterion;
  plannedActionFaithfulness: PreviewShotCriterion;
  contradiction: string | null;
  summary: string;
  passed: boolean;
}

export function buildPreviewShotQualityPrompt(input: PreviewShotQualityInput): string {
  const previous = input.previousPlannedAction?.trim() || "This is the opening shot; no previous shot.";
  const next = input.nextPlannedAction?.trim() || "This is the final shot; no following shot.";
  const shotMode = input.shotMode ?? "product";
  const product = input.productName?.trim() || "the selected product";
  const rolePolicy = {
    product: `PRODUCT_ONLY: show and promote ${product}; the selected character must not appear.`,
    character: "CHARACTER_ONLY: show the selected character; the product is intentionally absent and must not be required or invented.",
    environment: "ENVIRONMENT_ONLY: show the planned setting without the selected product or character; neither identity is required.",
    interaction: `INTERACTION: show ${product} and the selected character together only in the explicitly planned interaction.`,
  }[shotMode];
  const relevancePolicy = shotMode === "product"
    ? "the image clearly concerns and promotes the selected product, without introducing the character"
    : shotMode === "character"
      ? "the image follows the character-only plan; pass when the character is relevant and the product is correctly absent"
      : shotMode === "environment"
        ? "the image follows the environment-only plan; pass when the setting is relevant and both selected identities are correctly absent"
        : "the image shows the explicitly planned product-character interaction without inventing additional contact or handling";

  return [
    "You are a strict quality reviewer for an AI-generated advertising storyboard preview image.",
    `Review the ACTUAL IMAGE for shot ${input.shotIndex + 1} of ${input.totalShots}.`,
    "A still preview can show a credible instant within an action; do not require the entire motion to be visible in one frame.",
    `Shot role policy: ${rolePolicy}`,
    `Required planned action for this shot: ${input.plannedAction}`,
    `Previous planned action: ${previous}`,
    `Next planned action: ${next}`,
    "Judge all four criteria independently:",
    "1. physicalPlausibility: visible bodies, hands, tools, product placement, contact, scale, gravity, and motion cues could physically produce the planned action; reject impossible or contradictory staging.",
    `2. productRelevance: ${relevancePolicy}; reject any violation of this shot-role policy.`,
    "3. surroundingContinuity: the visible state is a coherent bridge from the previous plan toward the next plan; reject continuity breaks or repeated progress that does not advance the sequence.",
    "4. plannedActionFaithfulness: the image depicts a recognizable instant from the required action, not merely the right setting, product, or character while a different action occurs.",
    "Set contradiction to a short description when any visible fact contradicts the plan or neighboring actions; otherwise null.",
    "Return ONLY compact JSON with this exact shape:",
    '{"physicalPlausibility":{"passed":boolean,"reason":string},"productRelevance":{"passed":boolean,"reason":string},"surroundingContinuity":{"passed":boolean,"reason":string},"plannedActionFaithfulness":{"passed":boolean,"reason":string},"contradiction":string|null,"summary":string}',
  ].join("\n");
}

function criterion(value: unknown): PreviewShotCriterion | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.passed !== "boolean" || typeof item.reason !== "string") return null;
  return { passed: item.passed, reason: item.reason.trim() };
}

export function parsePreviewShotQualityResponse(raw: string): PreviewShotQualityEvaluation | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    return null;
  }

  const physicalPlausibility = criterion(parsed.physicalPlausibility);
  const productRelevance = criterion(parsed.productRelevance);
  const surroundingContinuity = criterion(parsed.surroundingContinuity);
  const plannedActionFaithfulness = criterion(parsed.plannedActionFaithfulness);
  if (!physicalPlausibility || !productRelevance || !surroundingContinuity || !plannedActionFaithfulness) return null;
  if (parsed.contradiction !== null && typeof parsed.contradiction !== "string") return null;
  if (typeof parsed.summary !== "string") return null;

  const contradiction = typeof parsed.contradiction === "string" && parsed.contradiction.trim()
    ? parsed.contradiction.trim()
    : null;
  const passed = [
    physicalPlausibility,
    productRelevance,
    surroundingContinuity,
    plannedActionFaithfulness,
  ].every((item) => item.passed) && contradiction === null;

  return {
    physicalPlausibility,
    productRelevance,
    surroundingContinuity,
    plannedActionFaithfulness,
    contradiction,
    summary: parsed.summary.trim(),
    passed,
  };
}
