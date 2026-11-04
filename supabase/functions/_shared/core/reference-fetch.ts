// Bounded, caller-scoped download of authorized reference images, plus a
// per-request "reference session" that re-checks authorization before every
// paid provider/model/evaluator call.
//
// Storage objects are read with the CALLER's bearer token (storage RLS decides,
// so a revoked library share returns 400/403/404 here too) — never with the
// service role. Every body is streamed under a per-image and a per-request
// aggregate byte cap with a timeout, and the declared MIME type must be
// png/jpeg/webp AND match the file's magic bytes.

import { authorizeReference, type ReferenceAuthOptions, type ReferenceDecision, type ReferenceRole } from "./reference-auth.ts";

export const MAX_REFERENCE_BYTES = 15 * 1024 * 1024;
export const MAX_REFERENCE_TOTAL_BYTES = 40 * 1024 * 1024;
export const REFERENCE_FETCH_TIMEOUT_MS = 20_000;

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export class ReferenceAccessError extends Error {
  constructor(
    message: string,
    readonly code: "not_authorized" | "changed" | "unavailable" | "too_large" | "bad_type" | "timeout",
  ) {
    super(message);
    this.name = "ReferenceAccessError";
  }
}

export interface ByteBudget {
  remaining: number;
}

export function createByteBudget(total = MAX_REFERENCE_TOTAL_BYTES): ByteBudget {
  return { remaining: total };
}

export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK))));
  }
  return btoa(parts.join(""));
}

export function sniffImageMime(b: Uint8Array): string | null {
  if (
    b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "image/webp";
  return null;
}

function normalizeMime(raw: string | null | undefined): string {
  const m = (raw ?? "").split(";")[0].trim().toLowerCase();
  return m === "image/jpg" ? "image/jpeg" : m;
}

function consume(budget: ByteBudget, n: number) {
  if (n > budget.remaining) throw new ReferenceAccessError("reference images exceed the request size limit", "too_large");
  budget.remaining -= n;
}

/** Streams a body, aborting as soon as the per-image or aggregate cap is hit. */
export async function readBoundedBody(res: Response, maxBytes: number, budget: ByteBudget): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > Math.min(maxBytes, budget.remaining)) {
    await res.body?.cancel().catch(() => {});
    throw new ReferenceAccessError("reference image too large", "too_large");
  }
  if (!res.body) throw new ReferenceAccessError("reference image is empty", "unavailable");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes || total > budget.remaining) {
        await reader.cancel().catch(() => {});
        throw new ReferenceAccessError("reference image too large", "too_large");
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof ReferenceAccessError) throw e;
    const name = (e as Error)?.name;
    throw new ReferenceAccessError(
      name === "TimeoutError" || name === "AbortError" ? "reference download timed out" : "reference download failed",
      name === "TimeoutError" || name === "AbortError" ? "timeout" : "unavailable",
    );
  }
  if (total === 0) throw new ReferenceAccessError("reference image is empty", "unavailable");
  consume(budget, total);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function toDataUrl(declaredMime: string, bytes: Uint8Array): string {
  const sniffed = sniffImageMime(bytes);
  if (!ALLOWED_MIME.has(declaredMime) || !sniffed || sniffed !== declaredMime) {
    throw new ReferenceAccessError("reference is not a supported image", "bad_type");
  }
  return `data:${sniffed};base64,${bytesToBase64(bytes)}`;
}

/** Validates a caller-supplied data:image URL (strict MIME + decoded size + budget). */
export function validateInlineImageDataUrl(dataUrl: string, budget: ByteBudget, maxBytes = MAX_REFERENCE_BYTES): string {
  const m = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]*)$/.exec(dataUrl);
  if (!m) throw new ReferenceAccessError("inline image is malformed", "bad_type");
  const b64 = m[2].replace(/\s+/g, "");
  if (Math.floor((b64.length * 3) / 4) > maxBytes + 3) throw new ReferenceAccessError("inline image too large", "too_large");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    throw new ReferenceAccessError("inline image is malformed", "bad_type");
  }
  if (bytes.byteLength === 0) throw new ReferenceAccessError("inline image is empty", "bad_type");
  if (bytes.byteLength > maxBytes) throw new ReferenceAccessError("inline image too large", "too_large");
  consume(budget, bytes.byteLength);
  return toDataUrl(normalizeMime(m[1]), bytes);
}

export interface FetchDeps {
  ownStorageOrigin: string;
  /** Caller's "Bearer <jwt>" header — storage RLS is evaluated for this user. */
  authHeader: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

/** Downloads an AUTHORIZED reference as a validated data URL. Fails closed. */
export async function downloadAuthorizedReference(
  decision: Extract<ReferenceDecision, { ok: true }>,
  deps: FetchDeps,
  budget: ByteBudget,
): Promise<string> {
  const doFetch = deps.fetchImpl ?? fetch;
  const maxBytes = deps.maxBytes ?? MAX_REFERENCE_BYTES;
  // Timeout covers connect AND the streamed body read.
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(Object.assign(new Error("reference download timed out"), { name: "TimeoutError" })),
    deps.timeoutMs ?? REFERENCE_FETCH_TIMEOUT_MS,
  );
  const signal = controller.signal;
  try {
    let target: string;
    let init: RequestInit;
    if (decision.ref) {
      const key = decision.ref.path.split("/").map(encodeURIComponent).join("/");
      target = `${deps.ownStorageOrigin}/storage/v1/object/authenticated/${encodeURIComponent(decision.ref.bucket)}/${key}`;
      init = { headers: { Authorization: deps.authHeader, apikey: deps.anonKey }, signal, redirect: "error" };
    } else {
      target = decision.url; // allowlisted external HTTPS host
      init = { signal, redirect: "error" };
    }
    let res: Response;
    try {
      res = await doFetch(target, init);
    } catch (e) {
      const name = (e as Error)?.name;
      throw new ReferenceAccessError(
        name === "TimeoutError" || name === "AbortError" ? "reference download timed out" : "reference download failed",
        name === "TimeoutError" || name === "AbortError" ? "timeout" : "unavailable",
      );
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      // 400/401/403/404 from storage = missing, expired or no longer visible.
      throw new ReferenceAccessError(
        `reference download failed (${res.status})`,
        [400, 401, 403, 404].includes(res.status) ? "not_authorized" : "unavailable",
      );
    }
    const declared = normalizeMime(res.headers.get("content-type"));
    if (!ALLOWED_MIME.has(declared)) {
      await res.body?.cancel().catch(() => {});
      throw new ReferenceAccessError("reference is not a supported image", "bad_type");
    }
    const bytes = await readBoundedBody(res, maxBytes, budget);
    return toDataUrl(declared, bytes);
  } finally {
    clearTimeout(timer);
  }
}

export interface ReferenceItem {
  url: string;
  role?: ReferenceRole;
}

export interface ReferenceSession {
  /** Authorize + download every reference. Must succeed before any paid call. */
  prepare(): Promise<void>;
  /** Re-run authorization; throws if any access was revoked or the asset changed. */
  revalidate(): Promise<void>;
  /** Validated data URL for a prepared reference (raw data: URLs pass through). */
  dataUrl(url: string): string;
}

/**
 * One session per request. Bytes are downloaded once (while authorized) but
 * authorization — including the exact asset id — is re-checked by
 * `revalidate()` immediately before each paid generation / evaluator attempt.
 */
export function createReferenceSession(
  items: readonly ReferenceItem[],
  auth: Omit<ReferenceAuthOptions, "role">,
  fetchDeps: FetchDeps,
  budget: ByteBudget = createByteBudget(),
): ReferenceSession {
  const prepared = new Map<string, { dataUrl: string; assetId: string | null; kind: string }>();
  const stored = items.filter((i) => !i.url.startsWith("data:"));

  async function authorizeAll(): Promise<Extract<ReferenceDecision, { ok: true }>[]> {
    const decisions = await Promise.all(stored.map((i) => authorizeReference(i.url, { ...auth, role: i.role })));
    const ok: Extract<ReferenceDecision, { ok: true }>[] = [];
    for (const d of decisions) {
      if (d.ok === false) throw new ReferenceAccessError(`reference not authorized (${d.reason})`, "not_authorized");
      ok.push(d as Extract<ReferenceDecision, { ok: true }>);
    }
    return ok;
  }

  return {
    async prepare() {
      for (const i of items) {
        if (i.url.startsWith("data:") && !prepared.has(i.url)) {
          prepared.set(i.url, { dataUrl: validateInlineImageDataUrl(i.url, budget), assetId: null, kind: "inline" });
        }
      }
      const decisions = await authorizeAll();
      for (const d of decisions) {
        if (prepared.has(d.url)) continue;
        prepared.set(d.url, { dataUrl: await downloadAuthorizedReference(d, fetchDeps, budget), assetId: d.assetId, kind: d.kind });
      }
    },
    async revalidate() {
      const decisions = await authorizeAll();
      for (const d of decisions) {
        const p = prepared.get(d.url);
        if (!p) throw new ReferenceAccessError("reference was not prepared", "not_authorized");
        if (p.kind !== d.kind || p.assetId !== d.assetId) {
          throw new ReferenceAccessError("reference asset changed", "changed");
        }
      }
    },
    dataUrl(url: string) {
      const p = prepared.get(url);
      if (!p) throw new ReferenceAccessError("reference was not prepared", "not_authorized");
      return p.dataUrl;
    },
  };
}
