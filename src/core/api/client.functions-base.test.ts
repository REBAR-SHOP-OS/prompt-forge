import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `authHeader` mints its token from the Supabase client, which targets
 * `VITE_SUPABASE_URL`. If this module's base URL is built from a separately
 * hardcoded project id, a staging or local build sends one project's token to a
 * different project and every call comes back 401 with nothing naming the cause.
 *
 * The second guarantee matters just as much: `VITE_SUPABASE_URL` is NOT set in
 * the build environment, so production resolves through the fallback. Changing
 * a fallback in this area has already caused one outage (see the note in
 * `@/integrations/supabase/client` about PR #83 shipping an empty anon key), so
 * the unset case is pinned to the exact historical URL.
 */
async function loadBase(): Promise<string> {
  vi.resetModules();
  const mod = await import("./client");
  return mod.FUNCTIONS_BASE;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("FUNCTIONS_BASE", () => {
  it("keeps the production URL byte-identical when VITE_SUPABASE_URL is unset", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    await expect(loadBase()).resolves.toBe(
      "https://sacxoanuyetjfrfllkzx.supabase.co/functions/v1",
    );
  });

  it("follows the configured project so the token and the endpoint agree", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://staging-project.supabase.co");
    await expect(loadBase()).resolves.toBe(
      "https://staging-project.supabase.co/functions/v1",
    );
  });

  it("does not produce a doubled slash when the configured URL has a trailing one", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://staging-project.supabase.co/");
    await expect(loadBase()).resolves.toBe(
      "https://staging-project.supabase.co/functions/v1",
    );
  });

  it("builds the base from the configured URL, not a second hardcoded project id", async () => {
    const source = await import("./client.ts?raw").then((m) => m.default);
    expect(source).toContain("import.meta.env.VITE_SUPABASE_URL");
    expect(source).not.toMatch(/const PROJECT_ID\s*=/);
    expect(source).not.toMatch(/https:\/\/\$\{PROJECT_ID\}/);
  });
});
