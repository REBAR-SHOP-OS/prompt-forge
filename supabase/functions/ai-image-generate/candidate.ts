import type { IdentityEvalOutcome } from "../_shared/identity-eval.ts";

/**
 * True only when every required reference identity is present AND matches.
 * Action quality is deliberately ignored here: an identity-safe candidate may
 * still be handed to the outer film-preview-quality correction layer, but an
 * identity mismatch is never returned.
 */
export function isIdentitySafe(
  outcome: IdentityEvalOutcome | null,
  referenceCount: number,
): boolean {
  if (!outcome || referenceCount <= 0) return false;
  if (outcome.perReference.length !== referenceCount) return false;
  return outcome.perReference.every((r) => r.present && r.match);
}

export type FinalDecision =
  | { kind: "accept"; dataUrl: string; review: null }
  | {
      kind: "accept-with-warning";
      dataUrl: string;
      review: { identityPassed: true; actionQualityPassed: false; warning: string };
    }
  | { kind: "reject" };

/**
 * Decide the response after the bounded attempts. `passedDataUrl` wins; else a
 * retained identity-safe candidate is returned with a non-fatal action-quality
 * warning (never labelled approved); else fail closed.
 */
export function decideFinalImage(input: {
  passedDataUrl: string | null;
  identitySafeCandidate: { dataUrl: string; outcome: IdentityEvalOutcome } | null;
}): FinalDecision {
  if (input.passedDataUrl) return { kind: "accept", dataUrl: input.passedDataUrl, review: null };
  const c = input.identitySafeCandidate;
  if (c) {
    const reason = c.outcome.actionQuality?.reason?.trim() || "Physical interaction review did not pass.";
    return {
      kind: "accept-with-warning",
      dataUrl: c.dataUrl,
      review: {
        identityPassed: true,
        actionQualityPassed: false,
        warning: `Action-quality review did not pass: ${reason.slice(0, 300)}`,
      },
    };
  }
  return { kind: "reject" };
}
