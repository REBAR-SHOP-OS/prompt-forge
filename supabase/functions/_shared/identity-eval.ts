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
// A real product photo folder can hold several angles of the same product,
// all of which should ground generation at once (see selectEvaluatedSpecs
// below for how identity-eval judges only a bounded subset of them). 6 covers
// a realistic folder (up to 5 angles) plus one character reference.
export const MAX_REFERENCE_IMAGES = 6;

/**
 * Validate the reference payload. Returns the validated specs (url + role +
 * characterSheet) or a clear error string. Enforces:
 *   - roles must be one of "product" | "character",
 *   - referenceRoles and referenceImageUrls must be the same length,
 *   - any number of product references (every grouped angle of one product)
 *     but at most one character, bounded overall by MAX_REFERENCE_IMAGES,
 *   - character role must be unique (no duplicate character; multiple
 *     product entries are allowed and expected for a multi-angle folder),
 *   - deterministic order: every product spec first (in its original relative
 *     order), then the character spec,
 *   - each URL must be a non-empty string.
 *
 * The optional `characterSheets` array (aligned 1:1 with the ORIGINAL input
 * order) is attached to each spec BEFORE the deterministic sort, so the flag
 * always travels with its own reference and is never misaligned by reordering.
 *
 * Accessibility (SSRF / ownership) is validated separately by the caller via
 * isAllowedReferenceUrl, because it needs the authenticated user id.
 */
export function validateReferenceSpecs(
  urls: unknown,
  roles: unknown,
  characterSheets?: unknown,
): { ok: true; specs: ReferenceSpec[] } | { ok: false; error: string } {
  const urlList = Array.isArray(urls)
    ? urls.filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];
  const roleList = Array.isArray(roles)
    ? roles.filter((r): r is string => typeof r === "string" && r.length > 0)
    : [];
  const sheetList = Array.isArray(characterSheets)
    ? characterSheets.map((v) => v === true)
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
      error: `At most ${MAX_REFERENCE_IMAGES} reference images are allowed.`,
    };
  }
  const seenRoles = new Set<string>();
  const specs: ReferenceSpec[] = [];
  for (let i = 0; i < urlList.length; i++) {
    const role = roleList[i].toLowerCase();
    if (!ALLOWED_ROLES.includes(role as ReferenceRole)) {
      return {
        ok: false,
        error: `Invalid reference role "${roleList[i]}". Allowed roles: product, character.`,
      };
    }
    // Multiple "product" entries are allowed (every grouped angle of one
    // product); only "character" is capped at one.
    if (role === "character" && seenRoles.has("character")) {
      return {
        ok: false,
        error: `Duplicate reference role "character". Only one character is allowed.`,
      };
    }
    seenRoles.add(role);
    // Attach the character-sheet flag to THIS spec (by original index) BEFORE
    // the deterministic sort below, so the flag stays with its own reference.
    const characterSheet = role === "character" && sheetList[i] === true;
    specs.push({ url: urlList[i], role: role as ReferenceRole, characterSheet });
  }
  // Deterministic order: every product spec first (in its original relative
  // order — Array.prototype.sort is stable), then the character spec. The
  // characterSheet flag was attached per-spec above, so reordering cannot
  // misalign it.
  specs.sort((a, b) => (a.role === "product" ? -1 : 1) - (b.role === "product" ? -1 : 1));
  return { ok: true, specs };
}

/**
 * Select the subset of validated specs that identity-eval should actually
 * judge for pass/fail: the FIRST product spec plus the character spec, if
 * present. A single generated image can only visually show one product
 * angle, so judging every grouped angle against it would fail spuriously —
 * the remaining product specs are generation-only grounding, not eval
 * targets. Order matches validateReferenceSpecs' deterministic output
 * (product before character).
 */
export function selectEvaluatedSpecs(specs: ReferenceSpec[]): ReferenceSpec[] {
  const firstProduct = specs.find((s) => s.role === "product");
  const character = specs.find((s) => s.role === "character");
  return [firstProduct, character].filter((s): s is ReferenceSpec => s !== undefined);
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
