import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { releaseScenarioLease } from "../supabase/functions/scenario-write/scenario-lease.ts";

describe("scenario-write lease release", () => {
  it("supports Supabase's then-only PostgREST PromiseLike", async () => {
    const result = { error: null };
    const thenOnly = {
      then: (onfulfilled: (value: typeof result) => unknown) =>
        Promise.resolve(onfulfilled(result)),
    } as PromiseLike<typeof result>;
    const request = vi.fn(() => thenOnly);
    const logError = vi.fn();

    await expect(releaseScenarioLease(request, logError)).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledOnce();
    expect(logError).not.toHaveBeenCalled();
    expect("catch" in thenOnly).toBe(false);
  });

  it("logs a failed release without rejecting the completed scenario request", async () => {
    const releaseFailure = new Error("release request failed");
    const logError = vi.fn();

    await expect(
      releaseScenarioLease(() => Promise.reject(releaseFailure), logError),
    ).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith("scenario-write lease release error", releaseFailure);
  });

  it("keeps the safe helper wired into the Edge Function finally block", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/scenario-write/index.ts"),
      "utf8",
    );

    expect(source).toMatch(/await releaseScenarioLease\(\(\) =>\s*serviceClient\.rpc/);
    expect(source).not.toMatch(/serviceClient\.rpc\([\s\S]*?\)\.catch\(/);
  });

  it("exposes the safe-release runtime revision on every response", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/scenario-write/index.ts"),
      "utf8",
    );

    expect(source).toContain(
      'export const SCENARIO_WRITE_RUNTIME_REVISION = "2026-09-15-safe-postgrest-release"',
    );
    expect(source).toMatch(
      /const corsHeaders = \{[\s\S]*?\.\.\.baseCorsHeaders,[\s\S]*?"Access-Control-Expose-Headers": "X-Scenario-Write-Revision",[\s\S]*?"X-Scenario-Write-Revision": SCENARIO_WRITE_RUNTIME_REVISION/,
    );
    expect(source).toMatch(
      /console\.error\("scenario-write unhandled error", \{[\s\S]*?revision: SCENARIO_WRITE_RUNTIME_REVISION,[\s\S]*?error: e/,
    );

    const responseCount = source.match(/new Response\(/g)?.length ?? 0;
    const revisionHeaderCount = source.match(
      /headers:\s*(?:corsHeaders|\{\s*\.\.\.corsHeaders)/g,
    )?.length ?? 0;
    expect(responseCount).toBeGreaterThan(0);
    expect(revisionHeaderCount).toBe(responseCount);
  });
});
