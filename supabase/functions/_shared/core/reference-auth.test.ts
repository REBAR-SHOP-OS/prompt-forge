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
function rlsTable(visibleOwners: string[], rows: { user_id: string; storage_path: string }[]): SharedAssetLookup {
  return async (ownerId, candidates) => {
    const row = rows.find((r) => visibleOwners.includes(r.user_id) && r.user_id === ownerId && candidates.includes(r.storage_path));
    return row?.user_id ?? null;
  };
}
const rows = [
  { user_id: sharer, storage_path: sharedFile },
  { user_id: stranger, storage_path: `${origin}/storage/v1/object/public/user-images/${stranger}/x.png` },
];
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
    expect(await authorizeReference(sharedFile, opts(async () => stranger))).toEqual({ ok: false, reason: "mismatch" });
  });

  it("legacy: bucket-relative path matches a row stored as a full URL", async () => {
    expect(await authorizeReference(`user-images/${sharer}/stirrup.png`, opts(rlsTable([caller, sharer], rows)))).toMatchObject({ ok: true, kind: "shared" });
    expect(storagePathCandidates({ bucket: "user-images", ownerId: sharer, path: `${sharer}/stirrup.png`, canonical: `user-images/${sharer}/stirrup.png` }, origin)).toContain(sharedFile);
  });

  it("shared access never extends to other buckets such as wan-frames", async () => {
    const url = `${origin}/storage/v1/object/public/wan-frames/${sharer}/stirrup.png`;
    expect(await authorizeReference(url, opts(async () => sharer))).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("SSRF: http, lookalike origins, unknown hosts and traversal are rejected; allowlisted host passes", async () => {
    const o = opts(async () => sharer);
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

describe("paid-render guards (source wiring)", () => {
  const gw = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/modules/job-orchestrator/gateway.ts"), "utf8");
  const gen = readFileSync(resolve(process.cwd(), "supabase/functions/ai-image-generate/index.ts"), "utf8");

  it("video jobs reject unauthorized references before createJob debits credits", () => {
    const reject = gw.indexOf('"REFERENCE_NOT_AUTHORIZED"');
    expect(reject).toBeGreaterThan(0);
    expect(reject).toBeLessThan(gw.indexOf("jobService.createJob(svc"));
    expect(gw).not.toMatch(/referenceImageUrls \?\? \[\]\)\.filter/);
  });

  it("references are revalidated before every provider start (incl. redispatch)", () => {
    const start = gw.indexOf("async function startProviderGenerationInBackground");
    const reval = gw.indexOf("authorizeJobReferences(params.userId, params.authHeader", start);
    expect(reval).toBeGreaterThan(start);
    expect(reval).toBeLessThan(gw.indexOf("aiGateway.startGeneration(", start));
  });

  it("image generation downloads all references before calling the model", () => {
    const preload = gen.indexOf("Promise.all(safeReferenceUrls.map((spec) => resolveRef(spec.url)))");
    const modelCall = gen.indexOf("ai.gateway.lovable.dev");
    expect(preload).toBeGreaterThan(0);
    expect(modelCall).toBeGreaterThan(preload);
    expect(gen).toContain("rlsSharedAssetLookup(getUserScopedClient(auth.authHeader))");
  });
});
