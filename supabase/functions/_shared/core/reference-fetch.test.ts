import { describe, expect, it, vi } from "vitest";
import type { SharedAssetLookup } from "./reference-auth";
import {
  createByteBudget,
  createReferenceSession,
  ReferenceAccessError,
  validateInlineImageDataUrl,
} from "./reference-fetch";
import { buildVeoReferenceImages } from "../modules/external-api-adapter/veo-references";

const origin = "https://project.supabase.co";
const caller = "11111111-1111-4111-8111-111111111111";
const sharer = "22222222-2222-4222-8222-222222222222";
const sharedUrl = `${origin}/storage/v1/object/public/user-images/${sharer}/stirrup.png`;
const ownUrl = `${origin}/storage/v1/object/sign/user-images/${caller}/me.png?token=t`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);

function imageResponse(bytes: Uint8Array, type = "image/png", status = 200) {
  return new Response(bytes, { status, headers: { "content-type": type } });
}

/** Mutable share state: flip `shared` to simulate revocation between attempts. */
function world() {
  const state = { shared: true, assetId: "asset-stirrup" };
  const lookup: SharedAssetLookup = vi.fn(async (ownerId, candidates) =>
    state.shared && ownerId === sharer && candidates.includes(sharedUrl)
      ? { id: state.assetId, ownerId: sharer, category: "product", imageType: null }
      : null);
  const fetchImpl = vi.fn(async () => imageResponse(PNG));
  const session = (urls: string[], budget = createByteBudget()) =>
    createReferenceSession(
      urls.map((url) => ({ url, role: "product" as const })),
      { userId: caller, ownStorageOrigin: origin, extraHosts: [], lookup },
      { ownStorageOrigin: origin, authHeader: "Bearer caller-jwt", anonKey: "anon", fetchImpl: fetchImpl as unknown as typeof fetch },
      budget,
    );
  return { state, lookup, fetchImpl, session };
}

describe("caller-scoped reference session", () => {
  it("owned and shared refs download with the CALLER's token via the authenticated storage route", async () => {
    const w = world();
    const s = w.session([ownUrl, sharedUrl]);
    await s.prepare();
    expect(s.dataUrl(sharedUrl)).toMatch(/^data:image\/png;base64,/);
    const calls = w.fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map((c) => c[0]).sort()).toEqual([
      `${origin}/storage/v1/object/authenticated/user-images/${caller}/me.png`,
      `${origin}/storage/v1/object/authenticated/user-images/${sharer}/stirrup.png`,
    ]);
    for (const [, init] of calls) {
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer caller-jwt");
      expect(init.redirect).toBe("error");
    }
  });

  it("revocation between attempts: revalidate throws so the next paid call never runs", async () => {
    const w = world();
    const s = w.session([sharedUrl]);
    await s.prepare();
    await expect(s.revalidate()).resolves.toBeUndefined(); // attempt 1 allowed
    w.state.shared = false; // share revoked
    const paid = vi.fn();
    await expect(s.revalidate().then(paid)).rejects.toBeInstanceOf(ReferenceAccessError);
    expect(paid).not.toHaveBeenCalled();
  });

  it("asset identity change between attempts is rejected", async () => {
    const w = world();
    const s = w.session([sharedUrl]);
    await s.prepare();
    w.state.assetId = "a-different-row";
    await expect(s.revalidate()).rejects.toMatchObject({ code: "changed" });
  });

  it.each([403, 404, 400, 401])("storage %i (forbidden / missing / expired) fails before any paid call", async (status) => {
    const w = world();
    w.fetchImpl.mockResolvedValueOnce(new Response("{}", { status, headers: { "content-type": "application/json" } }));
    await expect(w.session([sharedUrl]).prepare()).rejects.toMatchObject({ code: "not_authorized" });
  });

  it("network failure and timeout fail closed", async () => {
    const w = world();
    w.fetchImpl.mockRejectedValueOnce(new TypeError("connection reset"));
    await expect(w.session([sharedUrl]).prepare()).rejects.toMatchObject({ code: "unavailable" });
    const t = world();
    t.fetchImpl.mockRejectedValueOnce(Object.assign(new Error("t"), { name: "TimeoutError" }));
    await expect(t.session([sharedUrl]).prepare()).rejects.toMatchObject({ code: "timeout" });
  });

  it("strict MIME: declared type must be allowed AND match the magic bytes", async () => {
    const w = world();
    w.fetchImpl.mockResolvedValueOnce(imageResponse(JPEG, "image/png"));
    await expect(w.session([sharedUrl]).prepare()).rejects.toMatchObject({ code: "bad_type" });
    const g = world();
    g.fetchImpl.mockResolvedValueOnce(imageResponse(PNG, "image/svg+xml"));
    await expect(g.session([sharedUrl]).prepare()).rejects.toMatchObject({ code: "bad_type" });
  });

  it("streaming cap aborts an oversized body even without content-length", async () => {
    const w = world();
    const big = new Uint8Array(64);
    big.set(PNG);
    const body = new ReadableStream<Uint8Array>({
      pull(c) { c.enqueue(big); },
    });
    w.fetchImpl.mockResolvedValueOnce(new Response(body, { headers: { "content-type": "image/png" } }));
    const s = createReferenceSession(
      [{ url: sharedUrl }],
      { userId: caller, ownStorageOrigin: origin, extraHosts: [], lookup: w.lookup },
      { ownStorageOrigin: origin, authHeader: "Bearer x", anonKey: "a", fetchImpl: w.fetchImpl as unknown as typeof fetch, maxBytes: 1000 },
    );
    await expect(s.prepare()).rejects.toMatchObject({ code: "too_large" });
  });

  it("aggregate budget is enforced across references", async () => {
    const w = world();
    await expect(w.session([ownUrl, sharedUrl], createByteBudget(PNG.length + 2)).prepare())
      .rejects.toMatchObject({ code: "too_large" });
  });

  it("unshared reference never triggers a download", async () => {
    const w = world();
    w.state.shared = false;
    await expect(w.session([sharedUrl]).prepare()).rejects.toMatchObject({ code: "not_authorized" });
    expect(w.fetchImpl).not.toHaveBeenCalled();
  });
});

describe("inline data URLs", () => {
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  it("accepts real PNG bytes and rejects spoofed / unsupported types", () => {
    expect(validateInlineImageDataUrl(`data:image/png;base64,${b64(PNG)}`, createByteBudget())).toMatch(/^data:image\/png/);
    expect(() => validateInlineImageDataUrl(`data:image/png;base64,${b64(JPEG)}`, createByteBudget())).toThrow(ReferenceAccessError);
    expect(() => validateInlineImageDataUrl(`data:image/gif;base64,${b64(PNG)}`, createByteBudget())).toThrow(ReferenceAccessError);
    expect(() => validateInlineImageDataUrl(`data:image/png;base64,${b64(PNG)}`, createByteBudget(), 4)).toThrow(/too large/);
  });
});

describe("Veo required references", () => {
  it("fails before the provider call when any requested reference is missing", () => {
    expect(() => buildVeoReferenceImages({ referenceImageUrls: ["a", "b"], referenceImages: [{ mimeType: "image/png", data: "x" }] }))
      .toThrow(/provider start aborted/);
    expect(() => buildVeoReferenceImages({ referenceImageUrls: ["a"], referenceImages: null })).toThrow(/provider start aborted/);
  });
  it("passes caller-downloaded references through and is a no-op without references", () => {
    expect(buildVeoReferenceImages({ referenceImageUrls: ["a"], referenceImages: [{ mimeType: "image/png", data: "x" }] }))
      .toEqual([{ image: { bytesBase64Encoded: "x", mimeType: "image/png" }, referenceType: "asset" }]);
    expect(buildVeoReferenceImages({ referenceImageUrls: [] })).toBeUndefined();
  });
});
