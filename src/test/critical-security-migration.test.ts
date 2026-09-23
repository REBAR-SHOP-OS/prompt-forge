import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260916100000_critical_security_hardening.sql"),
  "utf8",
);

describe("critical generation-job privilege hardening", () => {
  it("removes authenticated write policies and table privileges while preserving SELECT", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "jobs: users insert own"');
    expect(migration).toContain('DROP POLICY IF EXISTS "jobs: users update own non-terminal"');
    expect(migration).toMatch(/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.generator_generation_jobs\s+FROM\s+authenticated/i);
    expect(migration).toMatch(/GRANT\s+SELECT\s+ON\s+public\.generator_generation_jobs\s+TO\s+authenticated/i);
    expect(migration).not.toMatch(/GRANT\s+(?:ALL|INSERT|UPDATE|DELETE).*generator_generation_jobs\s+TO\s+authenticated/i);
  });
});
