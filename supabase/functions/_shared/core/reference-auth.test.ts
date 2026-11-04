import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { authorizeReference, authorizeReferences, storagePathCandidates, type SharedAssetLookup } from "./reference-auth";

const origin = "https://project.supabase.co";
const caller = "11111111-1111-4111-8111-111111111111";
const sharer = "22222222-2222-4222-8222-222222222222";
const stranger = "33333333-3333-4333-8333-333333333333";
const sharedFile = `${origin}/storage/v1/object/public/user-images/${sharer}/stirrup.png`;

// Simulates the RLS-scoped table: rows visible to the caller = own + shared owners.
type Row = { id: string; user_id: string; storage_path: string; category?: string; deleted_at?: string | null };
function rlsTable(visibleOwners: string[], rows: Row[]): SharedAssetLookup {
  return async (ownerId, candidates) => {
    const row = rows.find((r) => !r.deleted_at && visibleOwners.includes(r.user_id) && r.user_id === ownerId && candidates.includes(r.storage_path));
    return row ? { id: row.id, ownerId: row.user_id, category: row.category ?? null, imageType: null } : null;
  };
}
const rows: Row[] = [
  { id: "asset-stirrup", user_id: sharer, storage_path: sharedFile, category: "product" },
  { id: "asset-x", user_id: stranger, storage_path: `${origin}/storage/v1/object/public/user-images/${stranger}/x.png` },
];
const rowFor = (owner: string) => async () => ({ id: "asset-1", ownerId: owner, category: null, imageType: null });
const opts = (lookup: SharedAssetLookup) => ({ userId: caller, ownStorageOrigin: origin, extraHosts: ["cdn.example.com"], lookup });

describe("authorizeReference", () => {
  it("owned: caller's own folder passes without a lookup", async () => {
    const lookup = vi.fn();
    const d = await authorizeReference(`${origin}/storage/v1/object/sign/user-images/${caller}/me.png?token=t`, opts(lookup));
    expect(d).toMatchObject({ ok: true, kind: "owned" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("shared: signed URL to a shared owner's exact asset passes", async () => {
    const url = `${origin}/storage/v1/object/sign/user-images/${sharer}/stirrup.png?token=abc`;
    expect(await authorizeReference(url, opts(rlsTable([caller, sharer], rows)))).toMatchObject({ ok: true, kind: "shared" });
  });

  it("unshared: another user's asset without a share is rejected", async () => {
    const url = `${origin}/storage/v1/object/public/user-images/${stranger}/x.png`;
    expect(await authorizeReference(url, opts(rlsTable([caller, sharer], rows)))).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("revoked: once the share row is gone the same asset is rejected", async () => {
    expect(await authorizeReference(sharedFile, opts(rlsTable([caller], rows)))).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("mismatched: an unrecorded object in a shared owner's folder is rejected", async () => {
    const url = `${origin}/storage/v1/object/public/user-images/${sharer}/not-a-catalog-item.png`;
    expect(await authorizeReference(url, opts(rlsTable([caller, sharer], rows)))).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("mismatched: lookup returning a different owner fails closed", async () => {
    expect(await authorizeReference(sharedFile, opts(rowFor(stranger)))).toEqual({ ok: false, reason: "mismatch" });
  });

  it("legacy: bucket-relative path matches a row stored as a full URL", async () => {
    expect(await authorizeReference(`user-images/${sharer}/stirrup.png`, opts(rlsTable([caller, sharer], rows)))).toMatchObject({ ok: true, kind: "shared" });
    expect(storagePathCandidates({ bucket: "user-images", ownerId: sharer, path: `${sharer}/stirrup.png`, canonical: `user-images/${sharer}/stirrup.png` }, origin)).toContain(sharedFile);
  });

  it("shared access never extends to other buckets such as wan-frames", async () => {
    const url = `${origin}/storage/v1/object/public/wan-frames/${sharer}/stirrup.png`;
    expect(await authorizeReference(url, opts(rowFor(sharer)))).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("SSRF: http, lookalike origins, unknown hosts and traversal are rejected; allowlisted host passes", async () => {
    const o = opts(rowFor(sharer));
    expect((await authorizeReference(sharedFile.replace("https:", "http:"), o)).ok).toBe(false);
    expect((await authorizeReference(`https://evil-project.supabase.co/storage/v1/object/public/user-images/${sharer}/stirrup.png`, o)).ok).toBe(false);
    expect((await authorizeReference("https://169.254.169.254/latest", o)).ok).toBe(false);
    expect((await authorizeReference(`user-images/${sharer}/%2e%2e/stirrup.png`, o)).ok).toBe(false);
    expect(await authorizeReference("https://cdn.example.com/a.png", o)).toMatchObject({ ok: true, kind: "external" });
  });

  it("lookup errors fail closed", async () => {
    expect((await authorizeReference(sharedFile, opts(async () => { throw new Error("db down"); }))).ok).toBe(false);
  });

  it("one bad reference fails the whole set", async () => {
    const r = await authorizeReferences([sharedFile, `${origin}/storage/v1/object/public/user-images/${stranger}/x.png`], opts(rlsTable([caller, sharer], rows)));
    expect(r.allOk).toBe(false);
  });
});

describe("asset identity across URL variants", () => {
  const lookup = rlsTable([caller, sharer], rows);
  it.each([
    ["public", `${origin}/storage/v1/object/public/user-images/${sharer}/stirrup.png`],
    ["signed", `${origin}/storage/v1/object/sign/user-images/${sharer}/stirrup.png?token=abc`],
    ["authenticated", `${origin}/storage/v1/object/authenticated/user-images/${sharer}/stirrup.png`],
    ["encoded", `${origin}/storage/v1/object/public/user-images/${sharer}/stirr%75p.png`],
    ["bucket-relative", `user-images/${sharer}/stirrup.png`],
  ])("%s URL resolves to the same stable asset id", async (_n, url) => {
    expect(await authorizeReference(url, opts(lookup))).toMatchObject({ ok: true, kind: "shared", assetId: "asset-stirrup" });
  });

  it("a row stored with a percent-encoded path matches its decoded URL", async () => {
    const enc = `${origin}/storage/v1/object/public/user-images/${sharer}/rebar%20stirrup.png`;
    const l = rlsTable([caller, sharer], [{ id: "asset-sp", user_id: sharer, storage_path: enc }]);
    expect(await authorizeReference(`${origin}/storage/v1/object/sign/user-images/${sharer}/rebar%20stirrup.png?token=t`, opts(l)))
      .toMatchObject({ ok: true, assetId: "asset-sp" });
  });

  it("soft-deleted shared rows never authorize", async () => {
    const l = rlsTable([caller, sharer], [{ id: "d", user_id: sharer, storage_path: sharedFile, deleted_at: "2026-01-01" }]);
    expect(await authorizeReference(sharedFile, opts(l))).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("role check: a shared product cannot be used as the character reference", async () => {
    expect(await authorizeReference(sharedFile, { ...opts(rlsTable([caller, sharer], rows)), role: "character" }))
      .toEqual({ ok: false, reason: "role_mismatch" });
    expect(await authorizeReference(sharedFile, { ...opts(rlsTable([caller, sharer], rows)), role: "product" }))
      .toMatchObject({ ok: true });
  });
});

describe("paid-render guards (source wiring)", () => {
  const gw = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/modules/job-orchestrator/gateway.ts"), "utf8");
  const gen = readFileSync(resolve(process.cwd(), "supabase/functions/ai-image-generate/index.ts"), "utf8");
  const edit = readFileSync(resolve(process.cwd(), "supabase/functions/ai-image-edit/index.ts"), "utf8");
  const svc = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/modules/external-api-adapter/service.ts"), "utf8");

  it("video jobs reject unauthorized references before createJob debits credits", () => {
    const reject = gw.indexOf('"REFERENCE_NOT_AUTHORIZED"');
    expect(reject).toBeGreaterThan(0);
    expect(reject).toBeLessThan(gw.indexOf("jobService.createJob(svc"));
  });

  it("references are re-authorized and caller-downloaded before every provider start", () => {
    const start = gw.indexOf("async function startProviderGenerationInBackground");
    const load = gw.indexOf("loadCallerReferenceImages(params.userId, params.authHeader", start);
    expect(load).toBeGreaterThan(start);
    expect(load).toBeLessThan(gw.indexOf("aiGateway.startGeneration(", start));
  });

  it("orchestrator hands the adapter a revalidation hook; every reference-bearing start goes through the guard", () => {
    expect(gw).toContain("revalidateReferences: callerRefs?.revalidate ?? null");
    expect(gw).toContain("await session.revalidate();");
    // Only the Veo extension call (no references) may hit providerStartFetch directly.
    expect(svc.match(/await providerStartFetch\(/g)?.length).toBe(1);
    expect(svc.match(/await guardedProviderStart\(input/g)?.length).toBe(3);
    // Both local fallback loops (ComfyUI + OpenAI-compatible) guard each real POST.
    expect(svc.match(/await runGuardedCreateAttempts\(/g)?.length).toBe(2);
    expect(svc).not.toMatch(/new Response\(null\)\)/);
  });

  it("Veo never skips or service-role-fetches reference images", () => {
    expect(svc).not.toContain("skipping");
    expect(svc).toContain("instance.referenceImages = buildVeoReferenceImages(input)");
  });

  it("image endpoints revalidate before each paid call and never use the service role for references", () => {
    for (const src of [gen, edit]) {
      expect(src).toContain("refSession.revalidate()");
      expect(src).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(src).not.toContain("getServiceClient");
    }
    const firstPaid = gen.indexOf("const resp = await fetch(");
    expect(gen.lastIndexOf("refSession.revalidate()", firstPaid)).toBeGreaterThan(gen.indexOf("refSession.prepare()"));
  });
});
