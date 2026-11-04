// Authorizes product/character reference image URLs for a caller.
//
// A reference passes only if it is either:
//  - on an explicitly allowlisted public host (HTTPS), or
//  - a Supabase Storage object on our own origin in an allowed bucket where
//      * the object sits in the caller's own folder (legacy/owned refs), or
//      * the exact object matches a generator_user_images row returned by a
//        CALLER-SCOPED (RLS) query. RLS only returns rows the caller owns or
//        that are shared to them via library_shares, so revoked or unshared
//        assets return no row and fail closed.
// Matching is exact equality on storage_path candidates — never wildcard.

export interface StorageObjectRef {
  bucket: string;
  ownerId: string;
  path: string; // owner-folder-relative key inside the bucket: "<owner>/<file>"
  canonical: string; // "<bucket>/<path>"
}

function decodeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded || decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\") || decoded.includes("\0")) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/** Parse a bucket-relative value or an own-origin object URL. Fails closed. */
export function parseStorageObjectRef(
  raw: string,
  ownStorageOrigin: string,
  allowedBuckets: readonly string[],
): StorageObjectRef | null {
  const trimmed = raw.trim();
  if (!trimmed || allowedBuckets.length === 0) return null;

  let rawSegments: string[];
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.origin !== ownStorageOrigin) return null;
    const prefix = "/storage/v1/object/";
    if (!url.pathname.startsWith(prefix)) return null;
    rawSegments = url.pathname.slice(prefix.length).split("/");
    if (["public", "sign", "authenticated"].includes(rawSegments[0] ?? "")) rawSegments.shift();
  } else {
    rawSegments = trimmed.split("/");
  }

  const decoded = rawSegments.map(decodeSegment);
  if (decoded.some((part) => part === null)) return null;
  const [bucket, ownerFolder, ...objectParts] = decoded as string[];
  if (!allowedBuckets.includes(bucket) || !ownerFolder || objectParts.length === 0) return null;
  const path = [ownerFolder, ...objectParts].join("/");
  return { bucket, ownerId: ownerFolder, path, canonical: `${bucket}/${path}` };
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Exact storage_path spellings a stored asset row may use for this object:
 * public / authenticated / bare object URLs, bucket-relative and owner-relative
 * keys, each both decoded and percent-encoded. Exact equality only.
 */
export function storagePathCandidates(ref: StorageObjectRef, ownStorageOrigin: string): string[] {
  const out = new Set<string>();
  for (const key of [ref.path, encodePath(ref.path)]) {
    const canonical = `${ref.bucket}/${key}`;
    for (const mode of ["public/", "authenticated/", ""]) {
      out.add(`${ownStorageOrigin}/storage/v1/object/${mode}${canonical}`);
    }
    out.add(canonical);
    out.add(key);
  }
  return [...out];
}

/** A live (non-deleted) generator_user_images row visible to the caller. */
export interface SharedAssetRow {
  id: string;
  ownerId: string;
  category: string | null;
  imageType: string | null;
}

/** Caller-scoped (RLS) lookup: returns the matching live row, or null. */
export type SharedAssetLookup = (ownerId: string, candidates: string[]) => Promise<SharedAssetRow | null>;

export type ReferenceRole = "product" | "character";

export interface ReferenceAuthOptions {
  userId: string;
  ownStorageOrigin: string;
  extraHosts: readonly string[];
  lookup: SharedAssetLookup;
  /** When given, a shared row explicitly tagged with the other role is rejected. */
  role?: ReferenceRole;
}

export type ReferenceDecision =
  | { ok: true; kind: "owned" | "shared" | "external"; ref: StorageObjectRef | null; assetId: string | null; url: string }
  | { ok: false; reason: "invalid" | "not_authorized" | "mismatch" | "role_mismatch" };

function rowRole(row: SharedAssetRow): ReferenceRole | null {
  const tag = (row.imageType ?? row.category ?? "").toLowerCase();
  if (tag === "character") return "character";
  if (tag === "product") return "product";
  return null; // general / reframe / legacy rows carry no role claim
}

const REFERENCE_BUCKETS = ["user-images"] as const;
const OWNED_ONLY_BUCKETS = ["user-images", "wan-frames"] as const;

export async function authorizeReference(url: string, opts: ReferenceAuthOptions): Promise<ReferenceDecision> {
  if (!url || url.length > 2048 || !opts.userId) return { ok: false, reason: "invalid" };
  let parsed: URL | null = null;
  if (/^https?:\/\//i.test(url)) {
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, reason: "invalid" };
    }
    if (parsed.protocol !== "https:") return { ok: false, reason: "invalid" };
    if (parsed.origin !== opts.ownStorageOrigin) {
      return opts.extraHosts.includes(parsed.hostname.toLowerCase())
        ? { ok: true, kind: "external", ref: null, assetId: null, url }
        : { ok: false, reason: "invalid" };
    }
  }

  const ref = parseStorageObjectRef(url, opts.ownStorageOrigin, OWNED_ONLY_BUCKETS);
  if (!ref) return { ok: false, reason: "invalid" };
  if (ref.ownerId === opts.userId) return { ok: true, kind: "owned", ref, assetId: null, url };
  if (!(REFERENCE_BUCKETS as readonly string[]).includes(ref.bucket)) return { ok: false, reason: "not_authorized" };

  let row: SharedAssetRow | null = null;
  try {
    row = await opts.lookup(ref.ownerId, storagePathCandidates(ref, opts.ownStorageOrigin));
  } catch {
    return { ok: false, reason: "not_authorized" };
  }
  if (!row || !row.id) return { ok: false, reason: "not_authorized" };
  if (row.ownerId !== ref.ownerId) return { ok: false, reason: "mismatch" };
  const tagged = rowRole(row);
  if (opts.role && tagged && tagged !== opts.role) return { ok: false, reason: "role_mismatch" };
  return { ok: true, kind: "shared", ref, assetId: row.id, url };
}

export async function authorizeReferences(
  urls: readonly string[],
  opts: ReferenceAuthOptions,
  roles?: readonly (ReferenceRole | undefined)[],
) {
  const decisions = await Promise.all(urls.map((u, i) => authorizeReference(u, { ...opts, role: roles?.[i] ?? opts.role })));
  return { allOk: decisions.every((d) => d.ok), decisions };
}

// Minimal structural type so this file stays free of the supabase-js import.
interface QueryClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): {
        in(col: string, v: string[]): {
          is(col: string, v: null): { limit(n: number): PromiseLike<{ data: unknown; error: unknown }> };
        };
      };
    };
  };
}

/**
 * Lookup bound to a user-scoped client so RLS decides own-or-shared access.
 * Soft-deleted rows never authorize. More than one live row for the same
 * object is ambiguous and fails closed (no stable asset identity).
 */
export function rlsSharedAssetLookup(userClient: QueryClient): SharedAssetLookup {
  return async (ownerId, candidates) => {
    const { data, error } = await userClient
      .from("generator_user_images")
      .select("id,user_id,category,image_type")
      .eq("user_id", ownerId)
      .in("storage_path", candidates)
      .is("deleted_at", null)
      .limit(2);
    if (error || !Array.isArray(data) || data.length !== 1) return null;
    const r = data[0] as { id?: unknown; user_id?: unknown; category?: unknown; image_type?: unknown };
    if (typeof r.id !== "string" || typeof r.user_id !== "string") return null;
    return {
      id: r.id,
      ownerId: r.user_id,
      category: typeof r.category === "string" ? r.category : null,
      imageType: typeof r.image_type === "string" ? r.image_type : null,
    };
  };
}

export function readExtraHosts(raw: string | undefined | null): string[] {
  return (raw ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}
