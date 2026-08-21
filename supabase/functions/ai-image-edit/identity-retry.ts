import type { EvalVerdict, IdentityEvalOutcome } from "../_shared/identity-eval.ts";

export type EditAttemptResult =
  | { kind: "success"; dataUrl: string }
  | { kind: "error"; status: number; error: string };

export type IdentityCheckResult = {
  verdict: EvalVerdict;
  outcome: IdentityEvalOutcome | null;
  status?: number;
  error?: string;
};

export type IdentityCheckedEditResult =
  | { kind: "success"; dataUrl: string }
  | { kind: "error"; status: number; error: string; outcome?: IdentityEvalOutcome | null };

/**
 * Generate and validate an edited image. Only an identity mismatch may start a
 * fresh generation; evaluator and gateway failures return immediately.
 */
export async function runIdentityCheckedEdit({
  referenceCount,
  maxAttempts,
  generate,
  evaluate,
}: {
  referenceCount: number;
  maxAttempts: number;
  generate: (attempt: number) => Promise<EditAttemptResult>;
  evaluate: (dataUrl: string) => Promise<IdentityCheckResult>;
}): Promise<IdentityCheckedEditResult> {
  let lastOutcome: IdentityEvalOutcome | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const generated = await generate(attempt);
    if (generated.kind === "error") return generated;
    if (referenceCount === 0) return generated;

    const checked = await evaluate(generated.dataUrl);
    if (checked.verdict === "pass") return generated;
    if (checked.verdict === "error") {
      return {
        kind: "error",
        status: checked.status ?? 502,
        error: checked.error ?? "Identity evaluator error",
        outcome: checked.outcome,
      };
    }
    lastOutcome = checked.outcome;
  }

  return {
    kind: "error",
    status: 422,
    error: "Could not preserve every selected identity in the edited image.",
    outcome: lastOutcome,
  };
}
