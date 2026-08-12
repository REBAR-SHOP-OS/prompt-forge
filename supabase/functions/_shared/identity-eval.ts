// Pure, testable identity-evaluation logic for the Make Full Film wizard.
//
// The wizard lets the user pick a product and a character in Step 1. The scene
// images in Step 3 (and Regenerate) must preserve BOTH identities. This module
// owns:
//   - validating the reference payload (roles, count, order, accessibility),
//   - the structured evaluation result shape (pass / identity-fail / error),
//   - building the vision-evaluation prompt and parsing its structured verdict.
//
// It is kept free of Deno.serve / request handling so it can be unit-tested
// directly (vitest) and imported by the ai-image-generate edge function.

export type ReferenceRole = "product" | "character";

export interface ReferenceSpec {
  url: string;
  role: ReferenceRole;
  /**
   * True when the reference is a multi-view character sheet (a single image
   * containing several turnaround views + facial expressions of ONE character).
   * A character sheet must be treated as a single identity: the generated
   * output must match the SAME person across every view, not just "a person".
   */
  characterSheet?: boolean;
}

export interface IdentityEvalResult {
  /** True when the output image was judged to contain the reference identity. */
  present: boolean;
  /** True when the present identity matches the reference closely enough. */
  match: boolean;
  /** Short human-readable reason for the verdict. */
  reason: string;
}

export interface IdentityEvalOutcome {
  /** Per-reference verdicts, aligned 1:1 with the validated reference specs. */
  perReference: IdentityEvalResult[];
  /** True only when every supplied reference is present AND matches. */
  passed: boolean;
}

/**
 * Three-outcome evaluation verdict:
 *   - "pass": every reference is present AND matches (accept the image).
 *   - "identity-fail": the image was produced but did not preserve the
 *     identities (retry is allowed, up to the bounded limit).
 *   - "error": the evaluator itself failed (technical error, invalid response,
 *     rate limit, credits, 5xx). This is NOT a retryable identity failure and
 *     must not trigger a fresh generation.
 */
export type EvalVerdict = "pass" | "identity-fail" | "error";

export const ALLOWED_ROLES: readonly ReferenceRole[] = ["product", "character"];
export const MAX_REFERENCE_IMAGES = 2;

/**
 * Validate the reference payload. Returns the validated specs (url + role) or a
 * clear error string. Enforces:
 *   - roles must be one of "product" | "character",
 *   - referenceRoles and referenceImageUrls must be the same length,
 *   - at most one product and one character (max 2 references),
 *   - roles must be unique (no duplicate product or duplicate character),
 *   - deterministic order: product first, then character,
 *   - each URL must be a non-empty string.
 * Accessibility (SSRF / ownership) is validated separately by the caller via
 * isAllowedReferenceUrl, because it needs the authenticated user id.
 */
export function validateReferenceSpecs(
  urls: unknown,
  roles: unknown,
): { ok: true; specs: ReferenceSpec[] } | { ok: false; error: string } {
  const urlList = Array.isArray(urls)
    ? urls.filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];
  const roleList = Array.isArray(roles)
    ? roles.filter((r): r is string => typeof r === "string" && r.length > 0)
    : [];

  if (urlList.length === 0 && roleList.length === 0) {
    return { ok: true, specs: [] };
  }
  if (urlList.length !== roleList.length) {
    return {
      ok: false,
      error: "referenceRoles and referenceImageUrls must have the same length.",
    };
  }
  if (urlList.length > MAX_REFERENCE_IMAGES) {
    return {
      ok: false,
      error: `At most ${MAX_REFERENCE_IMAGES} reference images are allowed (one product and one character).`,
    };
  }
  const seen = new Set<string>();
  const specs: ReferenceSpec[] = [];
  for (let i = 0; i < urlList.length; i++) {
    const role = roleList[i].toLowerCase();
    if (!ALLOWED_ROLES.includes(role as ReferenceRole)) {
      return {
        ok: false,
        error: `Invalid reference role "${roleList[i]}". Allowed roles: product, character.`,
      };
    }
    if (seen.has(role)) {
      return {
        ok: false,
        error: `Duplicate reference role "${role}". Only one product and one character are allowed.`,
      };
    }
    seen.add(role);
    specs.push({ url: urlList[i], role: role as ReferenceRole });
  }
  // Deterministic order: product first, then character.
  specs.sort((a, b) => (a.role === "product" ? -1 : 1) - (b.role === "product" ? -1 : 1));
  return { ok: true, specs };
}

/**
 * Build the vision-evaluation prompt. The evaluator receives the generated
 * image (labelled GENERATED_OUTPUT) plus each reference image (labelled
 * REF_n with its role) and must decide, per reference, whether the same
 * identity is present and matches. Returns a structured JSON object.
 */
export function buildIdentityEvalPrompt(specs: ReferenceSpec[]): string {
  const refs = specs
    .map((s, i) => {
      const sheetNote = s.role === "character" && s.characterSheet
        ? " (a multi-view character sheet: every view shows the SAME one person)"
        : "";
      return `- REF_${i + 1} (${s.role.toUpperCase()}): the image labelled "REF_${i + 1}"${sheetNote}`;
    })
    .join("\n");
  return [
    "You are a strict identity-preservation judge for AI-generated advertising images.",
    "You receive ONE generated image (labelled GENERATED_OUTPUT) plus reference images of a product and/or a character (labelled REF_1, REF_2, ...).",
    "For EACH reference, decide whether the SAME identity (the exact same product or the exact same character) is present in GENERATED_OUTPUT and matches closely enough.",
    "A product matches when it is the same item (same shape, materials, colors, branding) — not a similar-looking substitute.",
    "A character matches when it is the same person (same face, hair, skin tone, body type, and outfit) — not a different person.",
    "A character reference may be a MULTI-VIEW CHARACTER SHEET: a single image containing several turnaround views and facial expressions of ONE person. Treat the whole sheet as a single identity — every view is the same person.",
    "For a character sheet, the output is a match ONLY if the person in GENERATED_OUTPUT is the SAME person shown across the sheet's views (same face, hairstyle, skin tone, body type, and outfit). A different person — even a real-looking woman or man — is NOT a match, even if a person is present.",
    "Be strict: if the identity is absent or clearly different, mark it as not present / not matching.",
    "",
    `References to evaluate:`,
    refs,
    "",
    "Respond with ONLY a single minified JSON object, no markdown, no code fences, with EXACTLY this shape:",
    '{"perReference":[{"present":boolean,"match":boolean,"reason":string}]}',
    "The perReference array MUST have exactly one entry per reference, in the same order as REF_1, REF_2, ...",
    '"reason" is one short sentence per reference explaining the verdict.',
  ].join("\n");
}

/**
 * Parse the evaluator's raw text response into a structured outcome. Returns
 * null when the response cannot be parsed or has the wrong shape (treated as a
 * technical error by the caller, NOT a retryable identity failure).
 */
export function parseIdentityEvalResponse(
  raw: string,
  expectedCount: number,
): IdentityEvalOutcome | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: { perReference?: unknown };
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.perReference) || parsed.perReference.length !== expectedCount) {
    return null;
  }
  const perReference: IdentityEvalResult[] = [];
  for (const item of parsed.perReference) {
    if (typeof item !== "object" || item === null) return null;
    const o = item as Record<string, unknown>;
    if (typeof o.present !== "boolean" || typeof o.match !== "boolean") return null;
    perReference.push({
      present: o.present,
      match: o.match,
      reason: typeof o.reason === "string" ? o.reason : "",
    });
  }
  const passed = perReference.every((r) => r.present && r.match);
  return { perReference, passed };
}

/**
 * Classify a parsed evaluation outcome into a three-way verdict.
 *   - "pass": every reference present AND matches.
 *   - "identity-fail": an image was produced but one or more identities are
 *     missing or do not match (retryable).
 *   - "error": the outcome is null (unparseable / wrong shape) — a technical
 *     error, NOT retryable.
 */
export function classifyEvalVerdict(
  outcome: IdentityEvalOutcome | null,
): EvalVerdict {
  if (!outcome) return "error";
  return outcome.passed ? "pass" : "identity-fail";
}
