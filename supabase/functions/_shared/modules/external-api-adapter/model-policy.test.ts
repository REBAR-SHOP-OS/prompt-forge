import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertSupportedCloudModel, computeUsd } from "./model-policy";

describe("cloud video model policy", () => {
  it("accepts every priced production model", () => {
    expect(() => assertSupportedCloudModel("flow", "veo-3.1-fast-generate-preview")).not.toThrow();
    expect(() => assertSupportedCloudModel("flow", "veo-3.1-generate-preview")).not.toThrow();
    expect(() => assertSupportedCloudModel("wan", "wan2.7-i2v-2026-04-25")).not.toThrow();
  });

  it("rejects arbitrary or cross-provider cloud models", () => {
    expect(() => assertSupportedCloudModel("flow", "attacker/cheap-unpriced-model")).toThrow(/unsupported flow/);
    expect(() => assertSupportedCloudModel("wan", "veo-3.1-fast-generate-preview")).toThrow(/unsupported wan/);
  });

  it("never prices an unknown model at zero", () => {
    expect(() => computeUsd("attacker/unknown", 5)).toThrow(/missing price/);
    expect(computeUsd("wan2.7-i2v-2026-04-25", 5)).toBe(0.15);
    expect(computeUsd("veo-3.1-generate-preview", 15)).toBe(6.4);
  });

  it("revalidates and reprices self-healing dispatches", () => {
    const gateway = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/modules/job-orchestrator/gateway.ts"),
      "utf8",
    );
    const selfHeal = gateway.slice(gateway.indexOf("Self-healing fallback"), gateway.indexOf("Early-stuck guard"));
    expect(selfHeal).toContain("aiGateway.resolveRoute(");
    expect(selfHeal).toContain("estimatedCost: redispatchRoute.estimatedCost");
    expect(selfHeal).not.toContain("estimatedCost: 0");
  });
});
